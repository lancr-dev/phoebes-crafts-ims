import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).json({
    message: "Phoebe's Crafts API is running...",
  });
});

export default app;
