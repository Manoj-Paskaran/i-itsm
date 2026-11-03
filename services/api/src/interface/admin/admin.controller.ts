import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  AdminCategorySchema,
  AdminServiceSchema,
  AdminUserSchema,
  CreateCategoryRequestSchema,
  CreateServiceRequestSchema,
  CreateUserRequestSchema,
  SlaPolicyViewSchema,
  StrategySettingsSchema,
  UpdateCategoryRequestSchema,
  UpdateServiceRequestSchema,
  UpdateStrategiesRequestSchema,
  UpdateUserRequestSchema,
  UpsertSlaPolicyRequestSchema,
} from '@itsm/contracts';
import { AdminService } from '../../application/admin/admin.service.js';
import { InvalidInputException } from '../../domain/exceptions/index.js';
import { Permission, type User } from '../../domain/users/index.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new InvalidInputException('Invalid input.', { issues: parsed.error.issues });
  return parsed.data;
}

@Controller('admin')
@RequirePermissions(Permission.CONFIG_MANAGE)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users') async listUsers(@CurrentUser() user: User) {
    return z.array(AdminUserSchema).parse(await this.admin.listUsers(user));
  }
  @Post('users') @HttpCode(201) async createUser(@CurrentUser() user: User, @Body() body: unknown) {
    const input = parse(CreateUserRequestSchema, body);
    return AdminUserSchema.parse(await this.admin.createUser(user, input));
  }
  @Patch('users/:id') async updateUser(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(UpdateUserRequestSchema, body);
    return AdminUserSchema.parse(await this.admin.updateUser(user, id, input));
  }

  @Get('services') async listServices(@CurrentUser() user: User) {
    return z.array(AdminServiceSchema).parse(await this.admin.listServices(user));
  }
  @Post('services') @HttpCode(201) async createService(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ) {
    const input = parse(CreateServiceRequestSchema, body);
    return AdminServiceSchema.parse(await this.admin.createService(user, input));
  }
  @Patch('services/:id') async updateService(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(UpdateServiceRequestSchema, body);
    return AdminServiceSchema.parse(await this.admin.updateService(user, id, input));
  }

  @Get('categories') async listCategories(@CurrentUser() user: User) {
    return z.array(AdminCategorySchema).parse(await this.admin.listCategories(user));
  }
  @Post('categories') @HttpCode(201) async createCategory(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ) {
    const input = parse(CreateCategoryRequestSchema, body);
    return AdminCategorySchema.parse(await this.admin.createCategory(user, input));
  }
  @Patch('categories/:id') async updateCategory(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(UpdateCategoryRequestSchema, body);
    return AdminCategorySchema.parse(await this.admin.updateCategory(user, id, input));
  }

  @Get('sla-policies') async listPolicies(@CurrentUser() user: User) {
    return z.array(SlaPolicyViewSchema).parse(await this.admin.listPolicies(user));
  }
  @Post('sla-policies') @HttpCode(201) async createPolicy(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ) {
    const input = parse(UpsertSlaPolicyRequestSchema, body);
    return SlaPolicyViewSchema.parse(await this.admin.createPolicy(user, input));
  }
  @Put('sla-policies/:id') async updatePolicy(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(UpsertSlaPolicyRequestSchema, body);
    return SlaPolicyViewSchema.parse(await this.admin.updatePolicy(user, id, input));
  }

  @Get('strategies') strategies(@CurrentUser() user: User) {
    return StrategySettingsSchema.parse(this.admin.strategies(user));
  }
  @Put('strategies') updateStrategies(@CurrentUser() user: User, @Body() body: unknown) {
    const input = parse(UpdateStrategiesRequestSchema, body);
    return StrategySettingsSchema.parse(this.admin.updateStrategies(user, input));
  }
}
