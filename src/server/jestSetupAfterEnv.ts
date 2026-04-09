import { TransactionalTestStorage } from "./storage/TransactionalTestStorage";

const storage = new TransactionalTestStorage();
(global as any).testStorage = storage;

beforeEach(async () => {
  await storage.beginTransaction();
});

afterEach(async () => {
  await storage.rollbackTransaction();
});

afterAll(async () => {
  await storage.close();
});
