import { TestDesktopApp } from "./DesktopApp";
import TestLocalStorage from "./localFixtures/TestLocalStorage";

if (process.env.FIXTURES == "fresh-install") TestLocalStorage.loadFixtures();

if (process.env.FIXTURES == "batanga-synced")
  TestLocalStorage.loadFixtures("batanga-synced");

const app = new TestDesktopApp();
