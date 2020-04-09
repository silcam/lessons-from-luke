import { TestDesktopApp } from "./DesktopApp";

const app = new TestDesktopApp();

if (process.env.FIXTURES == "fresh-install") app.localStorage.loadFixtures();

if (process.env.FIXTURES == "batanga-synced")
  app.localStorage.loadFixtures("batanga-synced");
