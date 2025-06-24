# ConsentMD API

This is the backend API for the ConsentMD application, a platform for managing medical consents using blockchain technology. This service provides RESTful APIs to interact with the application's features.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Error Handling](#error-handling)
- [Linting](#linting)

## Features

- **Database**: MongoDB with Mongoose for object data modeling.
- **Authentication**: Secure authentication and authorization using JSON Web Tokens (JWT) with Passport.
- **Validation**: Request data validation using Joi.
- **Logging**: Comprehensive logging with Winston and Morgan.
- **Testing**: Unit and integration tests with Jest.
- **Error Handling**: Centralized error handling for consistent responses.
- **Docker Support**: Fully containerized for development and production environments.
- **Security**: Includes security headers with Helmet, data sanitization, and CORS protection.
- **Code Quality**: Enforced with ESLint and Prettier.

## Installation

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd V3/api
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Set up environment variables:**

    Create a `.env` file in the `api` directory by copying the example file:

    ```bash
    cp .env.example .env
    ```

    Then, modify the `.env` file with your specific configurations.

## Environment Variables

The `.env` file contains the following variables:

```
# Server port
PORT=3000

# MongoDB connection URL
MONGODB_URL=mongodb://127.0.0.1:27017/consent-md

# JWT Configuration
JWT_SECRET=your_jwt_secret
JWT_ACCESS_EXPIRATION_MINUTES=30
JWT_REFRESH_EXPIRATION_DAYS=30

# Email SMTP Configuration (optional, for email services)
SMTP_HOST=your_smtp_host
SMTP_PORT=your_smtp_port
SMTP_USERNAME=your_smtp_username
SMTP_PASSWORD=your_smtp_password
EMAIL_FROM=your_email_from
```

## Running the Application

### Locally

To run the server in development mode with live-reloading:

```bash
npm run dev
```

To run the server in production mode:

```bash
npm start
```

### With Docker

To run the application in a Docker container:

```bash
# Development mode
docker-compose up --build

# Production mode
docker-compose -f docker-compose.prod.yml up --build
```

### Testing

To run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# View test coverage
npm run coverage
```

## API Endpoints

All endpoints are prefixed with `/v1`.

### Auth Routes (`/auth`)

- `POST /register`: Register a new user.
- `POST /login`: Log in a user.
- `POST /refresh-tokens`: Refresh an authentication token.
- `POST /forgot-password`: Request a password reset.
- `POST /reset-password`: Reset a user's password.
- `POST /send-verification-email`: Send an email for verification.
- `POST /verify-email`: Verify a user's email.

### User Routes (`/users`)

- `POST /`: Create a new user.
- `GET /`: Get all users.
- `GET /:userId`: Get a single user by ID.
- `PATCH /:userId`: Update a user's details.
- `DELETE /:userId`: Delete a user.

### Record Routes (`/records`)

- `POST /`: Create a new medical record.
- `GET /`: Get all records.
- `GET /:recordId`: Get a single record by ID.
- `PATCH /:recordId`: Update a record.
- `DELETE /:recordId`: Delete a record.

### Consultation Routes (`/consultations`)

- `POST /`: Create a new consultation.
- `GET /`: Get all consultations.
- `GET /:consultationId`: Get a single consultation by ID.
- `PATCH /:consultationId`: Update a consultation.
- `DELETE /:consultationId`: Delete a consultation.

### QSCC Routes (`/qscc`)

- `GET /:channelName/chaincodes/:chaincodeName`: Query chaincode information.

## Project Structure

The API's source code is organized as follows:

```
src/
 |--config/         # Configuration files (env, logger)
 |--controllers/    # Route handlers and controller logic
 |--middlewares/    # Express middleware
 |--models/         # Mongoose data models and plugins
 |--routes/         # API route definitions
 |--services/       # Business logic and services
 |--utils/          # Utility functions and classes
 |--validations/    # Joi validation schemas
 |--app.js          # Express application setup
 |--index.js        # Application entry point
```

## Error Handling

The API uses a centralized error handling mechanism. Controllers forward errors to a middleware that sends a standardized JSON response:

```json
{
  "code": 404,
  "message": "Not Found"
}
```

During development, the response includes a stack trace.

## Linting

This project uses ESLint and Prettier for code linting and formatting.

To run the linter:

```bash
npm run lint
```

To automatically fix linting issues:

```bash
npm run lint:fix
```

To format code with Prettier:

```bash
npm run prettier
```
