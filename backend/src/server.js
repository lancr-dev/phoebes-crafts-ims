import 'dotenv/config';
import app from './app.js';
import connectMongoDB from './config/db.js';
import inventoryRoutes from './routes/inventoryRoutes.js';

const PORT = process.env.PORT;

await connectMongoDB();

app.use('/api/inventory', inventoryRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
