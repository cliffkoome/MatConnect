# MatConnect: IoT-Enabled Real-time Matatu Arrival Display

**MatConnect** is a full-stack web application designed to revolutionize the public transport experience in Kenya by providing real-time arrival information for matatus (public minibuses). By leveraging IoT GPS devices, this platform offers passengers accurate ETAs, reducing uncertainty and wait times at various stages. The system also includes robust administrative dashboards for system, matatu, and vehicle management.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
  - [Passenger Portal](#passenger-portal)
  - [Admin Dashboard](#admin-dashboard)
  - [Matatu Admin Dashboard](#matatu-admin-dashboard)
- [System Architecture](#system-architecture)
- [Core Business Logic](#core-business-logic)
  - [Real-time ETA Calculation](#real-time-eta-calculation)
  - [SMS Arrival Alerts](#sms-arrival-alerts)
  - [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [Technology Stack](#technology-stack)
- [Project Setup](#project-setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)

---

## Overview

The daily commute for many involves long, unpredictable waits for matatus. MatConnect addresses this by tracking GPS-enabled vehicles and calculating their real-time Estimated Time of Arrival (ETA) to designated stages.

The platform consists of three main components:
1.  **A Public-Facing Passenger Portal:** Allows users to view live ETAs for vehicles approaching their selected stage and subscribe to SMS alerts.
2.  **A System Administrator Dashboard:** A comprehensive control panel for managing all aspects of the system, including users, vehicles, and stages.
3.  **A Matatu Admin Dashboard:** A dedicated view for vehicle owners to monitor their fleet's performance.

## Key Features

### Passenger Portal

- **Real-time ETA Display:** Select a stage and view a live list of approaching matatus with their ETAs.
- **User Authentication:** Secure sign-up and login using email/password or Google OAuth 2.0.
- **Two-Factor Authentication (2FA):** Enhanced account security using TOTP (e.g., Google Authenticator).
- **SMS Arrival Alerts:** Subscribe to a stage to receive an SMS notification when a matatu arrives.
- **Feedback System:** Rate and comment on vehicle rides to provide valuable feedback.
- **Profile Management:** Update personal details, including the phone number required for SMS alerts.

### Admin Dashboard

- **Live System Overview:** A central dashboard displaying key metrics like total vehicles, online vehicles, and configured stages.
- **Live Vehicle Tracking:** A table showing the real-time status and last known location of all vehicles.
- **Comprehensive User Management:**
    - View, search (by name/email), and filter all system users (Admins, MatAdmins, Passengers).
    - Create new Admin or MatAdmin accounts.
    - Block, unblock, or permanently delete any user.
- **Stage & Vehicle Management:**
    - Create, view, and manage stages with their geographic coordinates.
    - Create new vehicles and assign them to MatAdmin owners.
    - Assign and unassign vehicles to/from stages to build routes.
- **Feedback Monitoring:** View a stream of the latest passenger feedback.

### Matatu Admin Dashboard

- **Fleet Overview:** A dedicated dashboard for vehicle owners to view and manage their assigned vehicles.
- **Performance Metrics:** (Future Scope) Track daily trips, distance covered, and other performance indicators.

## System Architecture

MatConnect is built on a modern, decoupled architecture:

- **Frontend:** A client-side application built with **HTML5, CSS3, and Vanilla JavaScript**. It communicates with the backend via a RESTful API.
- **Backend:** A **Node.js** server using the **Express.js** framework. It handles business logic, authentication, and data processing.
- **Database:** A **MariaDB** relational database, with **Sequelize** as the ORM for robust and safe data modeling and querying.
- **Real-time Data Ingestion:** **Firebase Realtime Database** acts as the ingestion point for live GPS coordinates sent from IoT devices installed in the matatus.
- **External Services:**
    - **Google Maps API:** Used for `Directions` (to calculate ETAs considering traffic) and `Geocoding` (to convert coordinates into human-readable addresses).
    - **Google OAuth 2.0:** For secure and convenient user authentication.
    - **Africa's Talking API:** For dispatching SMS arrival alerts to subscribed passengers.

## Core Business Logic

### Real-time ETA Calculation

The ETA calculation is handled by a background service (`etaCalculationService.js`) that runs every 30 seconds.

1.  The service fetches all stages and their assigned vehicles from the MariaDB database.
2.  For each vehicle, it retrieves the latest GPS location from the **Firebase Realtime Database**.
3.  If a vehicle is online, it uses the **Google Maps Directions API** to calculate the travel duration from the vehicle's current location to the stage's location. The `departure_time: 'now'` parameter is used to get traffic-aware ETAs.
4.  The distance to the stage is checked. If a vehicle is within a 50-meter radius, its status is marked as **'Arrived'**. Otherwise, it's **'Approaching'**.
5.  The calculated ETAs and statuses are then pushed to a dedicated `etas` node in Firebase, which the frontend clients listen to for live updates.

### SMS Arrival Alerts

1.  An authenticated passenger can subscribe to receive an alert for a specific stage. This requires them to have a verified phone number in their profile.
2.  When the background ETA service marks a vehicle's status as **'Arrived'**, it queries the database for all users subscribed to that stage.
3.  It iterates through the subscribers and sends an SMS notification via the **Africa's Talking API**.
4.  To prevent spam, a user is **automatically unsubscribed** from the stage immediately after receiving an alert.

### Role-Based Access Control (RBAC)

The system uses JSON Web Tokens (JWT) for authentication. Upon login, a user's role (`Admin`, `MatAdmin`, or `Passenger`) is encoded into the JWT.

A custom middleware (`authMiddleware.js`) protects backend routes by verifying the JWT and checking if the user's role has the necessary permissions for the requested resource. This ensures a secure separation of functionalities.

## Technology Stack

- **Backend:** Node.js, Express.js, Sequelize, Passport.js (for Google OAuth)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Database:** MariaDB, Firebase Realtime Database
- **APIs & Services:** Google Maps API, Google OAuth, Africa's Talking API
- **Authentication:** JWT, bcrypt (for password hashing), Speakeasy (for 2FA)

## Project Setup

### Prerequisites

- Node.js (v18.x or later)
- MariaDB (or MySQL)
- An account for Firebase, Google Cloud Platform, and Africa's Talking.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/cliffkoome/MatConnect
    cd GRP-A-ISP-cliffkoome
    ```

2.  **Install server dependencies:**
    ```bash
    cd server
    npm install
    ```

### Environment Configuration

1.  In the `server/` directory, create a `.env` file by copying the `.env.example` file.

2.  Fill in the required credentials in your `.env` file:
    ```env
    # Server
    PORT=5000
    SERVER_BASE_URL=http://localhost:5000

    # Database (MariaDB/MySQL)
    DB_HOST=localhost
    DB_USER=your_db_user
    DB_PASSWORD=your_db_password
    DB_NAME=matconnect_db

    # JWT Secrets
    JWT_SECRET=your_super_secret_key
    JWT_REFRESH_SECRET=your_super_secret_refresh_key

    # Google OAuth 2.0
    GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
    GOOGLE_CLIENT_SECRET=your_google_client_secret

    # Google Maps API
    GOOGLE_MAPS_API_KEY=your_google_maps_api_key

    # Africa's Talking API
    AFRICAS_TALKING_API_KEY=your_africastalking_api_key
    AFRICAS_TALKING_USERNAME=sandbox # or your live username

    # Email for Password Resets (e.g., using Gmail App Password)
    EMAIL_HOST=smtp.gmail.com
    EMAIL_PORT=465
    EMAIL_SECURE=true
    EMAIL_USER=your_email@gmail.com
    EMAIL_PASS=your_gmail_app_password
    ```

3.  **Firebase Setup:**
    - Create a Firebase project and set up the **Realtime Database**.
    - Generate a service account key JSON file.
    - Place the file in `server/config/` and rename it to `firebase-service-account.json`.

### Running the Application

1.  **Start the server:**
    From the `server/` directory, run:
    ```bash
    npm start
    ```
    This will start the server (usually on `http://localhost:5000`) and automatically synchronize the database schema.

2.  **Access the application:**
    Open your web browser and navigate to `http://localhost:5000`.

## API Endpoints

The API is organized by resource and protected by role-based authentication.

- `/api/auth/`: User registration, login (email/Google), 2FA, profile updates.
- `/api/admin/`: Admin-only endpoints for managing users, stages, vehicles, and viewing system data.
- `/api/stages/`: Public endpoints for fetching stages and managing SMS subscriptions.
- `/api/eta/`: Endpoints for fetching live ETA data for a specific stage.
- `/api/feedback/`: Endpoints for submitting and retrieving feedback.
