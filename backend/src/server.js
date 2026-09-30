import 'dotenv/config';
import app from './app.js';
import connectMongoDB from './config/db.js';

const PORT = process.env.PORT;

connectMongoDB();

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
