# Tailor Backend

Backend service for a modern tailor management system built with **NestJS, TypeScript, MongoDB, and Node.js**.

The system is designed to manage customers, measurements, tailoring orders, payments, alterations, appointments, fabrics, services, dashboards, reports, and audit logs through a modular and scalable backend architecture.

---

## 🚀 Tech Stack

| Technology        | Purpose                    |
| ----------------- | -------------------------- |
| Node.js           | Runtime                    |
| TypeScript        | Programming language       |
| NestJS            | Backend framework          |
| MongoDB           | Primary database           |
| Mongoose          | MongoDB ODM                |
| JWT               | Authentication             |
| Helmet            | HTTP security headers      |
| Class Validator   | Request validation         |
| Class Transformer | Request transformation     |
| NestJS Throttler  | Rate limiting              |
| Pino              | Application logging        |
| Docker            | Containerization           |
| Jest              | Unit & integration testing |
| Swagger           | API documentation          |

---

## 📁 Project Structure

```text
tailor-backend/
│
├── src/
│   ├── common/
│   │   ├── decorators/          # Custom decorators
│   │   ├── guards/              # Authentication & authorization guards
│   │   ├── interceptors/        # Request/response interceptors
│   │   │   └── response.interceptor.ts
│   │   ├── filters/             # Global exception filters
│   │   │   └── http-exception.filter.ts
│   │   ├── pipes/               # Custom validation/transformation pipes
│   │   ├── middleware/          # Application middleware
│   │   ├── constants/           # Application constants
│   │   └── utils/               # Shared utility functions
│   │
│   ├── config/
│   │   ├── app.config.ts        # Application configuration
│   │   ├── database.config.ts   # Database configuration
│   │   └── swagger.config.ts    # Swagger configuration
│   │
│   ├── health/
│   │   ├── health.controller.ts
│   │   └── health.module.ts
│   │
│   ├── auth/                    # Authentication & authorization
│   ├── users/                   # User management
│   ├── customers/               # Customer management
│   ├── measurements/            # Customer body measurements
│   ├── orders/                  # Tailoring orders
│   ├── payments/                # Payment management
│   ├── alterations/             # Alteration management
│   ├── appointments/            # Customer appointments
│   ├── fabrics/                 # Fabric management
│   ├── services/                # Tailoring services
│   ├── dashboard/               # Dashboard & analytics
│   ├── reports/                 # Business reports
│   ├── audit-logs/              # System audit logs
│   │
│   ├── app.module.ts            # Root application module
│   └── main.ts                  # Application entry point
│
├── test/                        # E2E tests
│
├── .env                         # Local environment variables
├── .env.example                 # Environment variable template
├── .dockerignore
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── eslint.config.mjs
├── nest-cli.json
├── package.json
├── tsconfig.json
└── README.md
```

---

# 🏗️ Architecture

The application follows a **modular NestJS architecture**.

Each business domain is isolated into its own module.

```text
                    ┌──────────────────────┐
                    │       Client         │
                    │ Web / Mobile / Admin │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │      NestJS API      │
                    │      /api/v1         │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
      Auth & Users         Customers             Orders
          │                    │                    │
          │                    ▼                    ├── Measurements
          │               Measurements              ├── Alterations
          │                                         ├── Payments
          │                                         └── Appointments
          │
          └──────────────────────┬─────────────────┘
                                 │
                                 ▼
                         ┌───────────────┐
                         │    MongoDB    │
                         └───────────────┘
```

Shared infrastructure such as authentication, validation, exception handling, logging, configuration, and security is maintained under `common/`.

---

# ✨ Core Modules

## Authentication

Responsible for:

* User authentication
* Login/logout
* JWT token management
* Role-based authorization
* Authentication guards
* Password management

---

## Users

Responsible for:

* User management
* Staff accounts
* User roles
* User permissions
* Account status

---

## Customers

Responsible for:

* Customer registration
* Customer profiles
* Contact information
* Customer history
* Customer order history

---

## Measurements

Responsible for:

* Customer measurements
* Measurement profiles
* Measurement history
* Measurement updates
* Reusable measurement records

Example:

```text
Customer
   │
   └── Measurement Profile
          ├── Chest
          ├── Waist
          ├── Shoulder
          ├── Sleeve
          ├── Length
          └── Other measurements
```

---

## Orders

Responsible for the complete tailoring order lifecycle.

Example order lifecycle:

```text
Created
   ↓
Measurement Confirmed
   ↓
Fabric Confirmed
   ↓
In Production
   ↓
Quality Check
   ↓
Ready
   ↓
Delivered
```

Orders can be associated with:

* Customer
* Measurements
* Fabric
* Tailoring service
* Alterations
* Payments
* Appointment

---

## Payments

Responsible for:

* Payment recording
* Advance payments
* Remaining balance
* Payment history
* Payment status
* Order payment tracking

Example:

```text
Order Amount      : ₹5,000
Advance Paid      : ₹2,000
Remaining Amount  : ₹3,000
```

---

## Alterations

Responsible for:

* Alteration requests
* Alteration details
* Alteration status
* Alteration history
* Linking alterations to orders

Example:

```text
Requested
    ↓
Assigned
    ↓
In Progress
    ↓
Completed
```

---

## Appointments

Responsible for:

* Customer appointments
* Measurement appointments
* Trial appointments
* Pickup appointments
* Appointment status
* Appointment scheduling

---

## Fabrics

Responsible for:

* Fabric catalog
* Fabric types
* Colors
* Available quantity
* Fabric pricing
* Inventory tracking

---

## Services

Responsible for managing tailoring services.

Examples:

* Shirt stitching
* Pant stitching
* Suit stitching
* Blazer stitching
* Alteration
* Custom tailoring

---

## Dashboard

Provides business-level information such as:

* Total customers
* Active orders
* Pending orders
* Completed orders
* Revenue
* Pending payments
* Appointments
* Alterations
* Fabric inventory

---

## Reports

Responsible for generating business reports such as:

* Sales reports
* Revenue reports
* Customer reports
* Order reports
* Payment reports
* Fabric reports
* Staff performance reports

---

## Audit Logs

Tracks important system activities.

Example:

```text
User: admin
Action: UPDATE_ORDER
Resource: Order
Resource ID: 12345
Timestamp: 2026-09-14T10:30:00Z
```

Audit logs help with:

* Security
* Debugging
* Accountability
* Compliance
* User activity tracking

---

# 🔐 Security

The application includes several security mechanisms.

### Helmet

HTTP security headers are enabled using Helmet.

```ts
app.use(helmet());
```

### CORS

CORS is configured through environment variables.

```env
CORS_ORIGIN=http://localhost:5173
```

### Request Validation

Global validation is enabled using `ValidationPipe`.

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
```

This prevents unexpected properties from being passed into the application.

### Rate Limiting

NestJS Throttler is used to protect APIs from excessive requests.

Default configuration:

```text
TTL   : 60 seconds
Limit : 100 requests
```

---

# 📦 API Versioning

All APIs are exposed under:

```text
/api/v1
```

Example:

```text
GET /api/v1/health
```

Future versions can be introduced without breaking existing clients.

```text
/api/v1
/api/v2
```

---

# 📋 Standard API Response

The application uses a global response interceptor to provide a consistent response structure.

Example successful response:

```json
{
  "success": true,
  "data": {
    "id": "123",
    "name": "John Doe"
  }
}
```

This provides a consistent contract for frontend and mobile clients.

---

# ❌ Error Handling

Global HTTP exception handling is implemented using:

```text
src/common/filters/http-exception.filter.ts
```

The application returns standardized error responses.

Example:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid request",
  "path": "/api/v1/customers"
}
```

---

# ⚙️ Configuration

Application configuration is managed using `@nestjs/config`.

Configuration files:

```text
src/config/
├── app.config.ts
├── database.config.ts
└── swagger.config.ts
```

Example:

```ts
ConfigModule.forRoot({
  isGlobal: true,
  load: [appConfig, databaseConfig],
});
```

---

# 🔑 Environment Variables

Create a `.env` file in the project root.

Example:

```env
NODE_ENV=development

PORT=3000

CORS_ORIGIN=http://localhost:5173

MONGODB_URI=mongodb://localhost:27017/tailor
```

Use `.env.example` as the template for required environment variables.

> Never commit `.env` to Git.

---

# 🚀 Getting Started

## Prerequisites

Make sure you have the following installed:

* Node.js 22+
* npm
* MongoDB
* Git

Check Node.js:

```bash
node --version
```

Check npm:

```bash
npm --version
```

---

## Installation

Clone the repository:

```bash
git clone <repository-url>
```

Navigate to the project:

```bash
cd tailor-backend
```

Install dependencies:

```bash
npm install
```

---

## Environment Setup

Create the environment file:

```bash
cp .env.example .env
```

Update the values in `.env`.

Example:

```env
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/tailor
```

---

# 🏃 Running the Application

### Development

```bash
npm run start:dev
```

### Standard

```bash
npm run start
```

### Debug

```bash
npm run start:debug
```

### Production

First build the application:

```bash
npm run build
```

Then start:

```bash
npm run start:prod
```

---

# 🧪 Testing

Run unit tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Generate coverage:

```bash
npm run test:cov
```

Run E2E tests:

```bash
npm run test:e2e
```

---

# 🧹 Code Quality

Run ESLint:

```bash
npm run lint
```

Format the project:

```bash
npm run format
```

---

# 🐳 Docker

The project includes Docker configuration.

Build the image:

```bash
docker build -t tailor-backend .
```

Run the container:

```bash
docker run -p 3000:3000 tailor-backend
```

---

## Docker Compose

Start the application and supporting services:

```bash
docker compose up
```

Run in detached mode:

```bash
docker compose up -d
```

Stop services:

```bash
docker compose down
```

---

# ❤️ Health Check

The application exposes a health endpoint.

```http
GET /api/v1/health
```

Example:

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

This endpoint can be used by:

* Docker
* Kubernetes
* AWS
* Load balancers
* Monitoring systems
* Deployment pipelines

---

# 📚 API Documentation

Swagger/OpenAPI documentation is available when enabled.

Development URL:

```text
http://localhost:3000/api/docs
```

The Swagger documentation provides:

* Available endpoints
* Request parameters
* Request bodies
* Response schemas
* Authentication
* API testing

---

# 🔄 Development Workflow

Recommended development workflow:

```text
Feature Request
      ↓
Create / Update Module
      ↓
Controller
      ↓
DTO
      ↓
Service
      ↓
Repository / Mongoose
      ↓
Unit Tests
      ↓
E2E Tests
      ↓
Code Review
      ↓
Merge
      ↓
Deployment
```

---

# 📌 Module Development Convention

Each business module should follow a consistent structure.

Example:

```text
customers/
├── dto/
│   ├── create-customer.dto.ts
│   └── update-customer.dto.ts
├── schemas/
│   └── customer.schema.ts
├── customers.controller.ts
├── customers.service.ts
├── customers.module.ts
└── customers.spec.ts
```

### Controller

Responsible for:

* HTTP routes
* Request handling
* DTO validation
* Calling services

### Service

Responsible for:

* Business logic
* Database operations
* Domain rules

### DTO

Responsible for:

* Request validation
* Input transformation

### Schema

Responsible for:

* MongoDB document structure
* Mongoose configuration
* Database-level constraints

---

# 🧩 Common Layer

The `common` directory contains reusable infrastructure that can be shared across modules.

```text
common/
├── decorators/
├── guards/
├── interceptors/
├── filters/
├── pipes/
├── middleware/
├── constants/
└── utils/
```

### Decorators

Custom decorators used throughout the application.

### Guards

Authentication and authorization logic.

### Interceptors

Cross-cutting request/response behavior.

### Filters

Global exception handling.

### Pipes

Validation and transformation.

### Middleware

Request-level processing.

### Constants

Application-wide constants.

### Utils

Reusable utility functions.

---

# 📈 Scalability Considerations

The application is designed with scalability in mind.

Key principles:

* Modular architecture
* Stateless APIs
* Database indexing
* DTO-based validation
* API versioning
* Rate limiting
* Centralized error handling
* Centralized configuration
* Structured logging
* Audit logging
* Containerized deployment

Future infrastructure can include:

```text
                    ┌───────────────┐
                    │ Load Balancer │
                    └───────┬───────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
        ┌─────▼─────┐               ┌─────▼─────┐
        │ API Server │               │ API Server │
        │ Instance 1 │               │ Instance 2 │
        └─────┬─────┘               └─────┬─────┘
              │                           │
              └─────────────┬─────────────┘
                            │
                     ┌──────▼──────┐
                     │   MongoDB   │
                     └─────────────┘
```

---

# 🔮 Future Improvements

Potential future additions:

* Redis caching
* Background job processing
* Notification service
* Email notifications
* WhatsApp notifications
* Payment gateway integration
* Object storage for documents/images
* Advanced reporting
* Search optimization
* Event-driven architecture
* CI/CD pipeline
* Cloud deployment
* Horizontal scaling
* Distributed tracing

---

# 📜 Available Scripts

| Command               | Description              |
| --------------------- | ------------------------ |
| `npm run start`       | Start application        |
| `npm run start:dev`   | Start development server |
| `npm run start:debug` | Start with debugger      |
| `npm run start:prod`  | Start production server  |
| `npm run build`       | Build application        |
| `npm test`            | Run tests                |
| `npm run test:watch`  | Run tests in watch mode  |
| `npm run test:cov`    | Generate test coverage   |
| `npm run test:e2e`    | Run E2E tests            |
| `npm run lint`        | Run ESLint               |
| `npm run format`      | Format source code       |

---

# 🤝 Contributing

1. Create a feature branch.

```bash
git checkout -b feature/customer-management
```

2. Implement the feature.

3. Add/update tests.

4. Run linting and tests.

```bash
npm run lint
npm test
```

5. Commit the changes.

```bash
git commit -m "feat: add customer management"
```

6. Push the branch.

```bash
git push origin feature/customer-management
```

7. Create a Pull Request.

---

# 📝 Commit Convention

Recommended commit format:

```text
feat: add customer management
fix: resolve order status update
refactor: improve measurement service
test: add order service tests
docs: update API documentation
chore: update dependencies
```

---

# 📄 License

This project is currently marked as private and unlicensed.

```text
UNLICENSED
```

---

# 👨‍💻 Development Notes

This project follows NestJS best practices with a focus on:

* Clean modular architecture
* Separation of concerns
* Type safety
* Maintainability
* Testability
* Security
* Scalability
* Consistent API contracts

As the system grows, new business domains should be introduced as independent NestJS modules rather than adding business logic directly to `AppModule`.
