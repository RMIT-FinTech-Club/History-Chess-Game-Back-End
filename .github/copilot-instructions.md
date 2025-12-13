# Copilot Instructions for History-Chess-Game-Back-End

## Project Overview
The History Chess Game Back-End is a Node.js-based server application that supports the History Chess Game. It handles game logic, user authentication, data storage, and communication with the front-end. The project uses Fastify for its web framework and MongoDB for data persistence.

## Architecture
- **Core Components:**
  - `src/controllers/`: Contains route handlers for various API endpoints.
  - `src/services/`: Implements business logic and interacts with external systems.
  - `src/models/`: Defines data models and schemas.
  - `src/routes/`: Configures API routes and their associated controllers.
  - `src/configs/`: Stores configuration files for database, AWS, RabbitMQ, etc.
  - `src/plugins/`: Contains Fastify plugins for MongoDB, Prisma, Swagger, etc.
  - `src/queues/`: Implements message publishers for RabbitMQ.
  - `src/workers/`: Background workers for asynchronous tasks.

- **Data Flow:**
  - API requests are routed through `src/routes/`.
  - Controllers in `src/controllers/` handle the requests and delegate tasks to services in `src/services/`.
  - Services interact with models in `src/models/` or external systems (e.g., blockchain, RabbitMQ).

- **Database:**
  - MongoDB is the primary database, with Prisma as the ORM.
  - Prisma schema files are located in `prisma/schema.prisma`.

## Developer Workflows
### Installation
1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Create a `.env` file with the required environment variables (see `README.md`).

### Running the Application
1. Start MongoDB locally using `mongod`.
2. Run the application with `npm start`.

### Testing
- Tests are located in the `tests/` directory.
- Run tests using:
  ```bash
  npm test
  ```

### Debugging
- Use `nodemon` for live-reloading during development.
- Logs are configured in the application for debugging purposes.

## Project-Specific Conventions
- **Error Handling:**
  - Use Fastify's built-in error handling mechanisms.
  - Define custom error messages in services and propagate them to controllers.

- **Code Style:**
  - Follow TypeScript best practices.
  - Use ESLint for linting (configured in `eslint.config.js`).

- **Routing:**
  - Define routes in `src/routes/`.
  - Use schemas for request validation in `src/routes/schemas/`.

- **Messaging:**
  - RabbitMQ is used for message queues.
  - Publishers are in `src/queues/publishers/`.

## Integration Points
- **Blockchain:**
  - Interactions are implemented in `src/services/blockchain.service.ts`.
- **RabbitMQ:**
  - Configured in `src/configs/rabbitmq.ts`.
  - Used for asynchronous messaging.
- **Swagger:**
  - API documentation is generated using Swagger (plugin in `src/plugins/swagger.ts`).

## Examples
### Adding a New API Endpoint
1. Create a new route in `src/routes/`.
2. Implement the controller in `src/controllers/`.
3. Add business logic in `src/services/`.
4. Define request/response schemas in `src/routes/schemas/`.

### Adding a New Worker
1. Implement the worker logic in `src/workers/`.
2. Configure the worker in `src/configs/`.
3. Ensure the worker is started in `src/workers/startWorker.ts`.

---

For further details, refer to the `README.md` or specific files in the codebase.