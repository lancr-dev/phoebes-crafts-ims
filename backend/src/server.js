import 'dotenv/config';
import app from './app.js';
import connectMongoDB from './config/db.js';

const PORT = process.env.PORT || 5001;

await connectMongoDB();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port: ${PORT}`);
});
