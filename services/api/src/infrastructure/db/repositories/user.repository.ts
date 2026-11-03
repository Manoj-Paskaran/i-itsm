import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import {
  DatabaseFailureException,
  InvalidInputException,
} from '../../../domain/exceptions/index.js';
import { asItServiceId, asUserId, type Email, type UserId } from '../../../domain/shared/index.js';
import {
  Role,
  UserFactory,
  type Technician,
  type User,
  type UserSnapshot,
} from '../../../domain/users/index.js';
import type { UserRepository } from '../../../ports/index.js';
import { DB, type Database } from '../database.js';
import { users, technicianSkills, technicianServiceHistory, teamMembers } from '../schema/index.js';

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(@Inject(DB) private readonly db: Database) {}
  private async map(row: typeof users.$inferSelect): Promise<User> {
    const common = {
      id: asUserId(row.id),
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      active: row.active,
    };
    let snapshot: UserSnapshot;
    if (row.role === Role.EMPLOYEE)
      snapshot = { ...common, role: row.role, department: row.department! };
    else if (row.role === Role.TECHNICIAN || row.role === Role.TEAM_LEAD) {
      const [skills, history, team] = await Promise.all([
        this.db.select().from(technicianSkills).where(eq(technicianSkills.userId, row.id)),
        this.db
          .select()
          .from(technicianServiceHistory)
          .where(eq(technicianServiceHistory.userId, row.id)),
        this.db.select().from(teamMembers).where(eq(teamMembers.teamLeadId, row.id)),
      ]);
      const fields = {
        ...common,
        skills: skills.map((s) => s.skill),
        serviceHistory: history.map((h) => [asItServiceId(h.serviceId), h.resolvedCount] as const),
        maxActiveIncidents: row.maxActiveIncidents!,
        availability: row.availability!,
        experienceYears: row.experienceYears!,
      };
      snapshot =
        row.role === Role.TEAM_LEAD
          ? { ...fields, role: row.role, team: team.map((t) => asUserId(t.memberId)) }
          : { ...fields, role: row.role };
    } else snapshot = { ...common, role: row.role };
    return UserFactory.rehydrate(snapshot);
  }
  async findById(id: UserId): Promise<User | null> {
    try {
      const [row] = await this.db.select().from(users).where(eq(users.id, id));
      return row ? await this.map(row) : null;
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async findByEmail(email: Email): Promise<User | null> {
    try {
      const [row] = await this.db.select().from(users).where(eq(users.email, email.value));
      return row ? await this.map(row) : null;
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async listAll(): Promise<User[]> {
    try {
      return await Promise.all((await this.db.select().from(users)).map((row) => this.map(row)));
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async listTechnicians(): Promise<Technician[]> {
    try {
      const rows = await this.db
        .select()
        .from(users)
        .where(inArray(users.role, [Role.TECHNICIAN, Role.TEAM_LEAD]));
      return (await Promise.all(rows.map((row) => this.map(row)))) as Technician[];
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async listByRole(role: Role): Promise<User[]> {
    try {
      const rows = await this.db.select().from(users).where(eq(users.role, role));
      return await Promise.all(rows.map((row) => this.map(row)));
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async save(user: User): Promise<void> {
    const s = user.toSnapshot();
    const tech = s.role === Role.TECHNICIAN || s.role === Role.TEAM_LEAD ? s : null;
    const values = {
      id: s.id,
      name: s.name,
      email: s.email,
      passwordHash: s.passwordHash,
      role: s.role,
      active: s.active,
      department: s.role === Role.EMPLOYEE ? s.department : null,
      maxActiveIncidents: tech?.maxActiveIncidents ?? null,
      availability: tech?.availability ?? null,
      experienceYears: tech?.experienceYears ?? null,
    };
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(users).values(values).onConflictDoUpdate({ target: users.id, set: values });
        await tx.delete(technicianSkills).where(eq(technicianSkills.userId, s.id));
        await tx.delete(technicianServiceHistory).where(eq(technicianServiceHistory.userId, s.id));
        await tx.delete(teamMembers).where(eq(teamMembers.teamLeadId, s.id));
        if (tech?.skills.length)
          await tx
            .insert(technicianSkills)
            .values(tech.skills.map((skill) => ({ userId: s.id, skill })));
        if (tech?.serviceHistory.length)
          await tx.insert(technicianServiceHistory).values(
            tech.serviceHistory.map(([serviceId, resolvedCount]) => ({
              userId: s.id,
              serviceId,
              resolvedCount,
            })),
          );
        if (s.role === Role.TEAM_LEAD && s.team.length)
          await tx
            .insert(teamMembers)
            .values(s.team.map((memberId) => ({ teamLeadId: s.id, memberId })));
      });
    } catch (error) {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        cause.code === '23505' &&
        'constraint' in cause &&
        cause.constraint === 'users_email_unique'
      )
        throw new InvalidInputException('Email already exists.', {
          field: 'email',
          value: s.email,
        });
      throw new DatabaseFailureException(error);
    }
  }
}
