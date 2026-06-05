# Violation Patterns Reference

## Table of Contents

1. [Domain Layer Violations](#domain-layer-violations)
2. [Application Layer Violations](#application-layer-violations)
3. [Interface Misplacement](#interface-misplacement)
4. [Common Framework Violations](#common-framework-violations)
5. [Database Schema Pollution](#database-schema-pollution)

---

## Domain Layer Violations

Domain code must be pure—no external dependencies.

### Infrastructure Import

**Bad:**

```typescript
// src/domain/entities/User.ts
import { D1Database } from "@cloudflare/workers-types"; // ❌
import { PrismaClient } from "@prisma/client"; // ❌
```

**Fix:** Remove all infrastructure imports. Domain entities should only import other domain types.

### Direct Database Access

**Bad:**

```typescript
// src/domain/services/UserService.ts
export class UserService {
  async findUser(db: D1Database, id: string) {
    // ❌
    return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  }
}
```

**Fix:** Define repository interface in domain, inject implementation:

```typescript
// src/domain/interfaces/UserRepository.ts
export interface UserRepository {
  findById(id: string): Promise<User | null>;
}

// src/domain/services/UserService.ts
export class UserService {
  constructor(private userRepo: UserRepository) {}
  async findUser(id: string) {
    return this.userRepo.findById(id);
  }
}
```

### HTTP/Request Objects in Domain

**Bad:**

```typescript
// src/domain/entities/Task.ts
import { Request } from '@cloudflare/workers-types'; // ❌

export class Task {
  static fromRequest(req: Request) { ... } // ❌
}
```

**Fix:** Use plain DTOs. Parse requests in presentation layer.

### Async Operations for Non-Essential Logic

**Bad:**

```typescript
// src/domain/entities/Order.ts
export class Order {
  async calculateTotal() {
    // ❌ - fetches exchange rates
    const rate = await fetch("https://api.exchange.com/rate");
    return this.amount * rate;
  }
}
```

**Fix:** Pass rates as parameters or use domain services with injected dependencies.

---

## Application Layer Violations

Application layer orchestrates domain objects but must not know infrastructure details.

### Concrete Infrastructure Instantiation

**Bad:**

```typescript
// src/application/use-cases/CreateUser.ts
import { D1UserRepository } from "@infrastructure/repositories/D1UserRepository"; // ❌

export class CreateUser {
  async execute(data: CreateUserRequest) {
    const repo = new D1UserRepository(db); // ❌
    // ...
  }
}
```

**Fix:** Accept interface via constructor:

```typescript
import type { UserRepository } from "@domain/interfaces/UserRepository";

export class CreateUser {
  constructor(private userRepo: UserRepository) {} // ✓
  async execute(data: CreateUserRequest) {
    // use this.userRepo
  }
}
```

### Framework Types in Use Case Signatures

**Bad:**

```typescript
// src/application/use-cases/GetTasks.ts
import { Request, Response } from "@cloudflare/workers-types"; // ❌

export class GetTasks {
  async execute(request: Request): Promise<Response> {
    // ❌
    // ...
  }
}
```

**Fix:** Use plain DTOs:

```typescript
export class GetTasks {
  async execute(query: GetTasksQuery): Promise<TaskResponse[]> {
    // ✓
    // ...
  }
}
```

### Direct External API Calls

**Bad:**

```typescript
// src/application/use-cases/SendNotification.ts
export class SendNotification {
  async execute(userId: string) {
    await fetch('https://api.sendgrid.com/send', { ... }); // ❌
  }
}
```

**Fix:** Define port interface, inject adapter:

```typescript
// src/domain/interfaces/NotificationService.ts
export interface NotificationService {
  send(to: string, message: string): Promise<void>;
}

// src/application/use-cases/SendNotification.ts
export class SendNotification {
  constructor(private notifier: NotificationService) {}
  async execute(userId: string) {
    await this.notifier.send(userId, "Hello");
  }
}
```

---

## Interface Misplacement

Repository interfaces are ports—they belong in the domain layer.

### Interface in Infrastructure

**Bad:**

```
src/infrastructure/repositories/
├── UserRepository.ts      # Interface defined here ❌
└── D1UserRepository.ts    # Implementation
```

**Fix:**

```
src/domain/interfaces/
└── UserRepository.ts      # Interface here ✓

src/infrastructure/repositories/
└── D1UserRepository.ts    # Implementation imports interface
```

### Interface Importing Implementation Types

**Bad:**

```typescript
// src/domain/interfaces/CacheService.ts
import { KVNamespace } from "@cloudflare/workers-types"; // ❌

export interface CacheService {
  get(key: string, kv: KVNamespace): Promise<string | null>; // ❌
}
```

**Fix:** Keep interface pure:

```typescript
export interface CacheService {
  get(key: string): Promise<string | null>; // ✓
}
```

---

## Common Framework Violations

### Cloudflare Workers

Violation indicators:

- `@cloudflare/workers-types` in domain/application
- `D1Database`, `KVNamespace`, `DurableObject` in domain
- `Env` type in domain entities

### Express/Fastify/Hono

Violation indicators:

- `Request`, `Response`, `Context` in domain/application
- Middleware references in use cases
- Route handlers in application layer

### Database ORMs

Violation indicators:

- Prisma/TypeORM/Drizzle decorators on domain entities
- `@Entity()`, `@Column()` in domain
- Database client types in domain interfaces

### Validation Libraries

**Acceptable:** Using Zod/Yup in application layer DTOs
**Violation:** Decorators/validators directly on domain entities

```typescript
// Bad - domain entity
import { z } from 'zod'; // ❌ in domain
export class User {
  @IsEmail() email: string; // ❌
}

// Good - application DTO
import { z } from 'zod';
export const CreateUserSchema = z.object({ ... }); // ✓ in application/dto
```

---

## Database Schema Pollution

Domain entities must not have database-specific knowledge. Mapping between domain models and database rows belongs exclusively in the infrastructure layer (repository implementations).

### Domain Entity with Database Methods

**Bad:**

```typescript
// src/domain/entities/Task.ts
export class Task {
  constructor(
    private readonly id: string,
    private readonly userId: string,
    private completed: boolean
  ) {}

  // ❌ Domain entity knows about database schema
  toRow(): TaskRow {
    return {
      id: this.id,
      user_id: this.userId, // ❌ Snake_case leaks from database
      completed: this.completed ? 1 : 0, // ❌ DB encoding in domain
    };
  }

  // ❌ Domain entity knows how to reconstitute from database
  static fromRow(row: TaskRow): Task {
    return new Task(row.id, row.user_id, row.completed === 1);
  }
}
```

**Why this is wrong:**

1. **Domain knows database schema** - Entity is coupled to database table structure
2. **Snake_case leaks** - Database naming convention pollutes domain model
3. **DB-specific encoding** - Boolean to integer conversion is infrastructure concern
4. **Violates Single Responsibility** - Entity has both business logic and persistence logic

**Fix:** All mapping happens in repository implementation:

```typescript
// src/domain/entities/Task.ts
export class Task {
  private constructor(
    private readonly id: string,
    private readonly userId: string,
    private completed: boolean
  ) {}

  // ✓ Pure factory method for creating new tasks
  static create(props: { userId: string }): Task {
    return new Task(crypto.randomUUID(), props.userId, false);
  }

  // ✓ Reconstitution from trusted data (used by repository)
  static reconstitute(props: { id: string; userId: string; completed: boolean }): Task {
    return new Task(props.id, props.userId, props.completed);
  }

  // ✓ Business logic methods
  complete(): void {
    if (this.completed) {
      throw new DomainError("Task already completed");
    }
    this.completed = true;
  }

  // ✓ Getters for accessing data
  getId(): string {
    return this.id;
  }

  getUserId(): string {
    return this.userId;
  }

  isCompleted(): boolean {
    return this.completed;
  }
}

// src/infrastructure/repositories/D1TaskRepository.ts
import type { Task } from "@domain/entities/Task";
import type { TaskRepository } from "@domain/interfaces/TaskRepository";

// ✓ Row type is private to repository implementation
interface TaskRow {
  id: string;
  user_id: string;
  completed: number;
}

export class D1TaskRepository implements TaskRepository {
  constructor(private db: D1Database) {}

  async save(task: Task): Promise<void> {
    // ✓ Repository handles all mapping
    const row: TaskRow = {
      id: task.getId(),
      user_id: task.getUserId(), // ✓ CamelCase → snake_case here
      completed: task.isCompleted() ? 1 : 0, // ✓ Boolean → int here
    };

    await this.db
      .prepare("INSERT INTO tasks (id, user_id, completed) VALUES (?, ?, ?)")
      .bind(row.id, row.user_id, row.completed)
      .run();
  }

  async findById(id: string): Promise<Task | null> {
    const row = await this.db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();

    if (!row) {
      return null;
    }

    // ✓ Repository handles reconstitution
    return Task.reconstitute({
      id: row.id,
      userId: row.user_id, // ✓ snake_case → camelCase here
      completed: row.completed === 1, // ✓ int → Boolean here
    });
  }
}
```

### Exposed Row Types

**Bad:**

```typescript
// src/domain/entities/User.ts
export interface UserRow {
  // ❌ Row type exported from domain
  id: string;
  email: string;
  created_at: string;
}

export class User {
  toRow(): UserRow {
    // ❌
    // ...
  }
}
```

**Fix:** Row types are private to repository:

```typescript
// src/domain/entities/User.ts
export class User {
  // ✓ No row types, no toRow/fromRow methods
}

// src/infrastructure/repositories/D1UserRepository.ts
interface UserRow {
  // ✓ Private to this file
  id: string;
  email: string;
  created_at: string;
}

export class D1UserRepository {
  private toRow(user: User): UserRow {
    // ✓ Mapping is private implementation detail
    return {
      id: user.getId().toString(),
      email: user.getEmail().toString(),
      created_at: user.getCreatedAt(),
    };
  }

  private toDomain(row: UserRow): User {
    // ✓ Mapping is private implementation detail
    return User.reconstitute({
      id: UserId.fromString(row.id),
      email: Email.create(row.email),
      createdAt: row.created_at,
    });
  }
}
```

### Detection Checklist

When reviewing code for database schema pollution:

- [ ] Domain entities have `toRow()` or `fromRow()` methods
- [ ] Domain entities import database-specific types (D1Database, PrismaClient, etc.)
- [ ] Domain uses snake_case naming (leaking from database)
- [ ] Domain has DB-specific encoding logic (boolean to int, enum to string, etc.)
- [ ] Row types (`*Row` interfaces) defined in domain layer
- [ ] Repository interface exposes row types instead of domain entities

All of the above are violations. Mapping logic belongs exclusively in repository implementations.
