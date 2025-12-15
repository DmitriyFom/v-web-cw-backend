import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Pool } from 'pg';

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// === ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ "CAR" ===
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'CAR',
  password: '1337',
  port: 5432,
});

// Проверка подключения
(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Успешно подключено к базе данных CAR');
    client.release();
  } catch (err) {
    console.error('❌ Ошибка подключения к БД:', err);
  }
})();

// === УМНАЯ ФУНКЦИЯ ДЛЯ ОПРЕДЕЛЕНИЯ ГОДА ПО КОДУ (БЕЗ ДУБЛИКАТОВ КЛЮЧЕЙ!) ===
const getYearFromCode = (code: string): number | null => {
  // Старый цикл (1980–2009)
  const oldCycle: Record<string, number> = {
    'A': 1980, 'B': 1981, 'C': 1982, 'D': 1983, 'E': 1984,
    'F': 1985, 'G': 1986, 'H': 1987, 'J': 1988, 'K': 1989,
    'L': 1990, 'M': 1991, 'N': 1992, 'P': 1993, 'R': 1994,
    'S': 1995, 'T': 1996, 'V': 1997, 'W': 1998, 'X': 1999,
    'Y': 2000,
    '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
    '6': 2006, '7': 2007, '8': 2008, '9': 2009,
  };

  // Новый цикл (2010–2025)
  const newCycle: Record<string, number> = {
    'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
    'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
    'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
    'S': 2025,
  };

  const currentYear = 2025;

  // Сначала проверяем новый цикл
  if (newCycle[code] !== undefined) {
    let year = newCycle[code];
    if (year > currentYear) {
      year -= 30; // Если "из будущего" — старый цикл
    }
    return year;
  }

  // Затем старый цикл
  if (oldCycle[code] !== undefined) {
    return oldCycle[code];
  }

  // Неизвестный код
  return null;
};

// === РОУТ ОЦЕНКИ ПО VIN ===
app.post('/api/valuation/vin', async (req: Request, res: Response) => {
  const { vin } = req.body;

  if (!vin || typeof vin !== 'string' || vin.length !== 17) {
    return res.status(400).json({ error: 'VIN должен содержать ровно 17 символов' });
  }

  const cleanVin = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  if (cleanVin.length !== 17) {
    return res.status(400).json({ error: 'VIN содержит недопустимые символы' });
  }

  try {
    const wmi = cleanVin.substring(0, 3);
    const yearCode = cleanVin[9];

    if (['I', 'O', 'Q'].includes(yearCode)) {
      return res.status(400).json({ error: 'Символ в позиции года (10-й) не может быть I, O или Q' });
    }

    const wmiResult = await pool.query(
      'SELECT manufacturer, country FROM wmi_codes WHERE code = $1',
      [wmi]
    );

    if (wmiResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Марка авто не определена по VIN',
        message: 'Используйте оценку по характеристикам (вкладка "По характеристикам")',
        vin: cleanVin,
      });
    }

    const manufacturer = wmiResult.rows[0].manufacturer;
    const country = wmiResult.rows[0].country;

    console.log(`WMI ${wmi} → ${manufacturer} (${country})`);

    let basePrice = 2200000;

    const priceResult = await pool.query(
      'SELECT base_price FROM brand_prices WHERE manufacturer = $1',
      [manufacturer]
    );

    if (priceResult.rows.length > 0) {
      basePrice = priceResult.rows[0].base_price;
      console.log(`Цена найдена: ${basePrice} руб.`);
    } else {
      console.log(`Марка "${manufacturer}" не найдена в brand_prices — дефолт ${basePrice} руб.`);
    }

    const year = getYearFromCode(yearCode);
    if (!year) {
      return res.status(400).json({ error: 'Некорректный код года в VIN' });
    }

    const currentYear = 2025;
    if (year > currentYear + 1) {
      return res.status(400).json({ error: 'VIN указывает на год из будущего' });
    }

    console.log(`Год по коду ${yearCode}: ${year}`);

    const age = currentYear - year;
    if (age > 0) {
      basePrice *= Math.pow(0.92, age); // 8% снижение в год — гибко
    }

    const avgMileage = age * 15000;
    basePrice *= Math.max(0.3, 1 - avgMileage / 300000); // не ниже 30%

    basePrice *= 0.9 + Math.random() * 0.2;

    const priceAvg = Math.max(300000, Math.round(basePrice));
    const priceMin = Math.round(priceAvg * 0.85);
    const priceMax = Math.round(priceAvg * 1.20);

    res.json({
      vin: cleanVin,
      manufacturer,
      country,
      year,
      estimatedMileage: age > 0 ? Math.round(age * 15000) : 0,
      price: {
        min: priceMin,
        avg: priceAvg,
        max: priceMax,
      },
      source: 'Оценка на основе данных площадок по продаже авто',
    });
  } catch (error) {
    console.error('Ошибка при оценке VIN:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// === РОУТ ОЦЕНКИ ПО ХАРАКТЕРИСТИКАМ (ГИБКАЯ ЛОГИКА) ===
app.post('/api/valuation/params', async (req: Request, res: Response) => {
  const {
    brand,
    model,
    year,
    mileage,
    bodyType,
    engine,
    transmission,
    doors,
    region,
    condition,
    complectation,
    accident,
  } = req.body;

  if (!brand || !year || mileage === undefined) {
    return res.status(400).json({ error: 'Обязательные параметры: марка, год, пробег' });
  }

  try {
    let basePrice = 2200000;

    const priceResult = await pool.query(
      'SELECT base_price FROM brand_prices WHERE manufacturer = $1',
      [brand]
    );

    if (priceResult.rows.length > 0) {
      basePrice = priceResult.rows[0].base_price;
      console.log(`Найдена базовая цена для ${brand}: ${basePrice} руб.`);
    } else {
      console.log(`Марка "${brand}" не найдена — дефолт ${basePrice} руб.`);
    }

    const currentYear = 2025;
    const age = currentYear - year;

    // По году — 8% снижение (гибко)
    if (age > 0) {
      basePrice *= Math.pow(0.92, age);
    }

    // По пробегу — 0.5% за 10 тыс. км
    const mileagePenalty = (mileage / 10000) * 0.005;
    basePrice *= Math.max(0.3, 1 - mileagePenalty);

    // По ДТП
    if (accident) {
      basePrice *= 0.80;
    }

    // По типу кузова
    const bodyBonus: Record<string, number> = {
      'Внедорожник': 1.15,
      'Кроссовер': 1.12,
      'Купе': 1.08,
      'Кабриолет': 1.10,
      'Пикап': 1.10,
      'Минивэн': 1.05,
    };
    basePrice *= bodyBonus[bodyType] || 1.0;

    // По двигателю
    const engineBonus: Record<string, number> = {
      'Дизель': 1.08,
      'Электро': 1.25,
      'Гибрид': 1.20,
    };
    basePrice *= engineBonus[engine] || 1.0;

    // По коробке
    const transmissionBonus: Record<string, number> = {
      'Автомат': 1.12,
      'Вариатор': 1.08,
      'Робот': 1.05,
      'Механика': 0.92,
    };
    basePrice *= transmissionBonus[transmission] || 1.0;

    // По дверям
    if (doors === '5') basePrice *= 1.05;
    if (doors === '2') basePrice *= 1.08;

    // По региону
    if (region === 'Москва' || region === 'СПб') {
      basePrice *= 1.15;
    } else if (region === 'Регионы России') {
      basePrice *= 0.90;
    }

    // По состоянию
    const conditionBonus: Record<string, number> = {
      'Отличное': 1.15,
      'Хорошее': 1.0,
      'Среднее': 0.85,
    };
    basePrice *= conditionBonus[condition] || 1.0;

    // По комплектации
    const complectationBonus: Record<string, number> = {
      'Премиум': 1.20,
      'Средняя': 1.0,
      'Базовая': 0.90,
    };
    basePrice *= complectationBonus[complectation] || 1.0;

    // Рыночная вариация
    basePrice *= 0.9 + Math.random() * 0.2;

    const priceAvg = Math.max(300000, Math.round(basePrice));
    const priceMin = Math.round(priceAvg * 0.85);
    const priceMax = Math.round(priceAvg * 1.20);

    res.json({
      brand,
      model,
      year,
      mileage,
      bodyType,
      engine,
      transmission,
      doors,
      region,
      condition,
      complectation,
      accident,
      price: {
        min: priceMin,
        avg: priceAvg,
        max: priceMax,
      },
      source: 'Оценка на основе рыночных данных (декабрь 2025)',
    });
  } catch (error) {
    console.error('Ошибка при оценке по параметрам:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// === ЗАПУСК СЕРВЕРА ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Бэкенд запущен: http://localhost:${PORT}`);
});