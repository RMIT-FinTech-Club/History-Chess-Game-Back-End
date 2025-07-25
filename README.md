# History-Chess-Game-Back-End

## Introduction
The History Chess Game Back-End is the server-side component of the History Chess Game. It handles game logic, user authentication, data storage, and communication with the front-end.

## Prerequisites
Before running the application, ensure you have the following installed:
- [Node.js](https://nodejs.org/en/download/) (version 14.x or later)
- [npm](https://www.npmjs.com/get-npm) (version 6.x or later)
- [MongoDB](https://www.mongodb.com/try/download/community)

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/History-Chess-Game-Back-End.git
   cd History-Chess-Game-Back-End
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create a `.env` file in the root directory and add the following environment variables:**
   ```plaintext
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/history-chess-game
   JWT_SECRET=your_jwt_secret
   ```

## Running the Application

1. **Start the MongoDB server:**
   ```bash
   mongod
   ```

2. **Start the application:**
   ```bash
   npm start
   ```

3. The application should now be running on `http://localhost:8080`.

## API Endpoints

### User Authentication
- **POST** `/api/v1/register` - Register a new user
- **POST** `/api/v1/login` - Login an existing user

### Game Management
- **GET** `/api/v1/games` - Retrieve all games
- **POST** `/api/v1/games` - Create a new game
- **GET** `/api/v1/games/:id` - Retrieve a specific game by ID
- **PUT** `/api/v1/games/:id` - Update a specific game by ID
- **DELETE** `/api/v1/games/:id` - Delete a specific game by ID

## Technologies Used
- Node.js
- Fastify
- MongoDB
- JWT (JSON Web Token) for authentication

## Contributing
Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add some feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Create a Pull Request

## License
This project is licensed under the MIT License.

---

Let me know if you need any more details or modifications!