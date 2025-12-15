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

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'CAR',
  password: '1337', 
});

(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Успешно подключено к БД');
    client.release();
  } catch (err) {
    console.error('❌ Ошибка подключения к БД:', err);
  }
})();

const yearMap: Record<string, number> = {
  'A': 1980, 'B': 1981, 'C': 1982, 'D': 1983, 'E': 1984,
  'F': 1985, 'G': 1986, 'H': 1987, 'J': 1988, 'K': 1989,
  'L': 1990, 'M': 1991, 'N': 1992, 'P': 1993, 'R': 1994,
  'S': 1995, 'T': 1996, 'V': 1997, 'W': 1998, 'X': 1999,
  'Y': 2000,
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
  '6': 2006, '7': 2007, '8': 2008, '9': 2009,

  'A2010': 2010, 'B2011': 2011, 'C2012': 2012, 'D2013': 2013, 'E2014': 2014,
  'F2015': 2015, 'G2016': 2016, 'H2017': 2017, 'J2018': 2018, 'K2019': 2019,
  'L2020': 2020, 'M2021': 2021, 'N2022': 2022, 'P2023': 2023, 'R2024': 2024,
  'S2025': 2025, 'T2026': 2026, 'V2027': 2027, 'W2028': 2028, 'X2029': 2029,
  'Y2030': 2030, '12031': 2031, '22032': 2032, '32033': 2033, '42034': 2034,
  '52035': 2035, '62036': 2036, '72037': 2037, '82038': 2038, '92039': 2039,
};

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
      console.log(`Цена для марки "${manufacturer}" не найдена — используется дефолт ${basePrice} руб.`);
    }

    let year = yearMap[yearCode];
    if (!year) {
      return res.status(400).json({ error: 'Некорректный код года в VIN' });
    }

    const currentYear = 2025;

    if (year > currentYear) {
      year -= 30;
    }

    if (year > currentYear + 1) {
      return res.status(400).json({ error: 'VIN указывает на год из будущего' });
    }

    console.log(`Год по коду ${yearCode}: ${year}`);

    const age = currentYear - year;

    if (age > 0) {
      basePrice *= Math.pow(0.88, age);
    }

    const avgMileage = age * 15000;
    basePrice *= Math.max(0.5, 1 - avgMileage / 250000);

    basePrice *= 0.9 + Math.random() * 0.2;

    const priceAvg = Math.max(500000, Math.round(basePrice));
    const priceMin = Math.round(priceAvg * 0.88);
    const priceMax = Math.round(priceAvg * 1.15);

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


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Бэкенд запущен: http://localhost:${PORT}`);
});

app.post('/api/valuation/params', async (req: Request, res: Response) => {
  const { brand, model, year, mileage, bodyType, engine, transmission, doors, accident } = req.body;

  if (!brand || !year || !mileage) {
    return res.status(400).json({ error: 'Обязательные параметры: марка, год, пробег' });
  }

  try {
    let basePrice = 2200000; // Дефолт

    const priceResult = await pool.query(
      'SELECT base_price FROM brand_prices WHERE manufacturer = $1',
      [brand]
    );

    if (priceResult.rows.length > 0) {
      basePrice = priceResult.rows[0].base_price;
      console.log(`Найдена цена для ${brand}: ${basePrice} руб.`);
    } else {
      console.log(`Марка "${brand}" не найдена в brand_prices — дефолт ${basePrice} руб.`);
    }

    const currentYear = 2025;
    const age = currentYear - year;
    if (age > 0) {
      basePrice *= Math.pow(0.88, age); 
    }

    const mileagePenalty = mileage / 10000 * 0.01; // 1% за 10 тыс. км
    basePrice *= Math.max(0.5, 1 - mileagePenalty); // не ниже 50%

    if (accident) {
      basePrice *= 0.85;
    }

    if (bodyType === 'Внедорожник') {
      basePrice *= 1.1; // +10%
    }

    basePrice *= 0.9 + Math.random() * 0.2;

    const priceAvg = Math.max(500000, Math.round(basePrice));
    const priceMin = Math.round(priceAvg * 0.88);
    const priceMax = Math.round(priceAvg * 1.15);

    res.json({
      brand,
      model,
      year,
      mileage,
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

