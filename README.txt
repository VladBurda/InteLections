InteLections

What InteLections can do

At this stage, the project includes a set of features:

user registration and login
Google OAuth login
profile editing
course creation and publishing
lesson creation
folders and lesson materials
hosted video, audio, documents, and YouTube embeds
lesson quizzes with multiple question types
AI-assisted quiz draft generation
groups and classes for teacher-student collaboration
subscriptions and paid courses
Stripe Checkout and Stripe Connect integration
Main idea behind the project

The project was built around the idea that learning content should be more than just a collection of uploaded files. 
In InteLections, content is organized into lessons, materials, quizzes, and class-related actions, so the platform can 
be used both by someone learning alone and by someone working inside a teacher-managed class.

Another important part of the project is the authoring side. A course creator can prepare content step by step, 
upload materials, organize them into folders, build quizzes manually, or use OpenAI to generate an editable quiz draft. 
Paid courses and seller onboarding were added to show how the platform could also grow into a small educational marketplace.

Roles in the system

The application supports several user roles, each with a slightly different experience:

Student — joins classes, opens assigned courses, solves quizzes, and follows learning materials
Teacher — creates classes, assigns courses, invites students, and reviews activity and progress
Personal — focuses on creating and publishing content without the classroom workflow
Admin — moderates selected actions and provides platform-level control

Running the project locally:
Requirements
Node.js 20+
npm

Install and start
npm install
npm run dev

Default local addresses
frontend: http://localhost:5173
backend: http://localhost:4000
Environment configuration

The project reads local configuration from .env. An example file is included as .env.example.

Important variables:

OPENAI_API_KEY=
OPENAI_QUIZ_MODEL=gpt-5-mini
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_INTELECTIONS_PLUS_PRICE_ID=
STRIPE_CONNECT_RETURN_URL=http://localhost:5173/account?connect=return
STRIPE_CONNECT_REFRESH_URL=http://localhost:5173/account?connect=refresh
STRIPE_PLATFORM_APPLICATION_FEE_PERCENT=1

DEFAULT_DEMO_PASSWORD=Intelections123!
Demo accounts

Teacher / author: jan@example.com
Student: vlad@example.com
Admin: admin@intelections.local
default password: Intelections123!

AI support

Quiz generation is handled on the backend through the OpenAI API.
A few important notes:
AI generates an editable draft only
nothing is saved automatically
quizzes can always be created manually without AI

Payments

The payment layer currently includes:
InteLections+ subscription flow
one-time checkout for paid courses
seller onboarding through Stripe Connect
a 1% platform fee for paid course purchases
For local testing, Stripe should be used in test mode.

Validation

Current limitations:

InteLections is still a thesis project and not a fully production-ready platform yet.

Some current limitations are:

test coverage is still lighter than in a mature production system
password reset works locally and does not send real emails
Stripe and OpenAI features depend on local configuration and test setup
billing history and marketplace functionality are not expanded fully yet
