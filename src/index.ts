import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'car-valuation-backend', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
app.get('/', (req, res) => {
  res.json({ message: 'Car Valuation API v1', health: '/api/health' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'car-valuation-backend', timestamp: new Date().toISOString() });
});

app.post('/api/valuation/vin', (req, res) => {
  const { vin } = req.body;

  if (!vin || vin.length !== 17) {
    return res.status(400).json({ message: 'Неверный VIN' });
  }

  // Пока мок, потом будет API Авто.ру
  setTimeout(() => {
    res.json({
      vin: vin.toUpperCase(),
      brand: 'Toyota',
      model: 'Camry',
      year: 2021,
      priceMin: 2800000,
      priceAvg: 3150000,
      priceMax: 3500000,
      source: 'Мок-данные (скоро — Авто.ру API)',
    });
  }, 1200);
});
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});