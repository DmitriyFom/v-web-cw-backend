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
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});