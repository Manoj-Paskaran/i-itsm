import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  AssignRequestSchema,
  AuditEntrySchema,
  CloseAsDuplicateRequestSchema,
  CreateIncidentRequestSchema,
  FeedbackRequestSchema,
  IncidentDetailSchema,
  IncidentInsightsSchema,
  IncidentListQuerySchema,
  IncidentSummarySchema,
  NoteRequestSchema,
  ProvideInfoSchema,
  RecommendationSchema,
  RejectRequestSchema,
  RequestInfoSchema,
  ResolveRequestSchema,
  SimilarIncidentSchema,
  SimilarityRequestSchema,
  SlaRiskEntrySchema,
  type IncidentDetail,
} from '@itsm/contracts';
import { IncidentInsightsService } from '../../application/incidents/incident-insights.service.js';
import { IncidentService } from '../../application/incidents/incident.service.js';
import { InvalidInputException } from '../../domain/exceptions/index.js';
import { Permission as P, type User } from '../../domain/users/index.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new InvalidInputException('Invalid input.', { issues: result.error.issues });
  return result.data;
}
const idSchema = z.uuid();
function detail(value: IncidentDetail, user: User) {
  const own = value.reporter.id === user.id();
  const assigned = value.assignee?.id === user.id();
  const actions = value.allowedActions.filter((action) => {
    switch (action) {
      case 'classify':
        return false;
      case 'assign':
      case 'closeAsDuplicate':
        return user.can(P.INCIDENT_ASSIGN);
      case 'acknowledge':
      case 'startWork':
      case 'requestInfo':
      case 'resolve':
        return assigned && user.can(P.INCIDENT_WORK);
      case 'addNote':
        return (
          (assigned && user.can(P.INCIDENT_WORK)) ||
          user.can(P.INCIDENT_VIEW_ALL) ||
          // While a question is pending the reporter answers it via provideInfo, not a note.
          (own && value.status !== 'PENDING_INFO')
        );
      case 'provideInfo':
      case 'verify':
      case 'reject':
        return own && user.can(P.INCIDENT_VERIFY_OWN);
      case 'close':
        return user.can(P.INCIDENT_ASSIGN) || (own && user.can(P.INCIDENT_VERIFY_OWN));
      case 'giveFeedback':
        return own && user.can(P.INCIDENT_FEEDBACK);
    }
  });
  return IncidentDetailSchema.parse({ ...value, allowedActions: actions });
}
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly incidents: IncidentService,
    private readonly insightsService: IncidentInsightsService,
  ) {}
  @Post() async report(@CurrentUser() u: User, @Body() b: unknown) {
    return detail(await this.incidents.report(u, parse(CreateIncidentRequestSchema, b)), u);
  }
  /** Advisory "is this already reported?" check for the report form (IF-A). */
  @Post('similar') @HttpCode(200) async similar(@CurrentUser() u: User, @Body() b: unknown) {
    return z
      .array(SimilarIncidentSchema)
      .parse(await this.insightsService.similar(u, parse(SimilarityRequestSchema, b)));
  }
  /** Advisory SLA breach risk for every visible open incident (IF-E, SLA monitor). */
  @Get('sla-risk') async slaRisk(@CurrentUser() u: User) {
    return z.array(SlaRiskEntrySchema).parse(await this.insightsService.slaRisks(u));
  }
  @Get() async list(@CurrentUser() u: User, @Query() q: unknown) {
    return z
      .array(IncidentSummarySchema)
      .parse(await this.incidents.list(u, parse(IncidentListQuerySchema, q)));
  }
  @Get(':id') async get(@CurrentUser() u: User, @Param('id') id: string) {
    return detail(await this.incidents.get(u, parse(idSchema, id)), u);
  }
  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermissions(P.INCIDENT_ASSIGN)
  async assign(@CurrentUser() u: User, @Param('id') id: string, @Body() b: unknown) {
    return detail(
      await this.incidents.assign(
        u,
        parse(idSchema, id),
        parse(AssignRequestSchema, b).technicianId,
      ),
      u,
    );
  }
  @Post(':id/acknowledge') @HttpCode(200) async acknowledge(
    @CurrentUser() u: User,
    @Param('id') id: string,
  ) {
    return detail(await this.incidents.acknowledge(u, parse(idSchema, id)), u);
  }
  @Post(':id/start') @HttpCode(200) async start(@CurrentUser() u: User, @Param('id') id: string) {
    return detail(await this.incidents.startWork(u, parse(idSchema, id)), u);
  }
  @Post(':id/notes') @HttpCode(200) async note(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return detail(
      await this.incidents.addNote(u, parse(idSchema, id), parse(NoteRequestSchema, b).text),
      u,
    );
  }
  @Post(':id/request-info') @HttpCode(200) async requestInfo(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return detail(
      await this.incidents.requestInfo(
        u,
        parse(idSchema, id),
        parse(RequestInfoSchema, b).question,
      ),
      u,
    );
  }
  @Post(':id/provide-info') @HttpCode(200) async provideInfo(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return detail(
      await this.incidents.provideInfo(u, parse(idSchema, id), parse(ProvideInfoSchema, b).answer),
      u,
    );
  }
  @Post(':id/resolve') @HttpCode(200) async resolve(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const data = parse(ResolveRequestSchema, b);
    return detail(
      await this.incidents.resolve(u, parse(idSchema, id), data.summary, data.rootCause),
      u,
    );
  }
  @Post(':id/verify') @HttpCode(200) async verify(@CurrentUser() u: User, @Param('id') id: string) {
    return detail(await this.incidents.verify(u, parse(idSchema, id)), u);
  }
  @Post(':id/reject') @HttpCode(200) async reject(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return detail(
      await this.incidents.reject(u, parse(idSchema, id), parse(RejectRequestSchema, b).reason),
      u,
    );
  }
  @Post(':id/feedback') @HttpCode(200) async feedback(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const data = parse(FeedbackRequestSchema, b);
    return detail(
      await this.incidents.feedback(u, parse(idSchema, id), data.rating, data.comment),
      u,
    );
  }
  @Post(':id/close') @HttpCode(200) async close(@CurrentUser() u: User, @Param('id') id: string) {
    return detail(await this.incidents.close(u, parse(idSchema, id)), u);
  }
  @Post(':id/close-as-duplicate')
  @HttpCode(200)
  @RequirePermissions(P.INCIDENT_ASSIGN)
  async duplicate(@CurrentUser() u: User, @Param('id') id: string, @Body() b: unknown) {
    return detail(
      await this.incidents.closeAsDuplicate(
        u,
        parse(idSchema, id),
        parse(CloseAsDuplicateRequestSchema, b).duplicateOfId,
      ),
      u,
    );
  }
  @Get(':id/recommendations') @RequirePermissions(P.INCIDENT_ASSIGN) async recommendations(
    @CurrentUser() u: User,
    @Param('id') id: string,
  ) {
    return z
      .array(RecommendationSchema)
      .parse(await this.incidents.recommendations(u, parse(idSchema, id)));
  }
  @Get(':id/audit') async audit(@CurrentUser() u: User, @Param('id') id: string) {
    return z.array(AuditEntrySchema).parse(await this.incidents.audit(u, parse(idSchema, id)));
  }
  /** Advisory similar incidents, correlation cluster and suggested resolutions (IF-A/B/G). */
  @Get(':id/insights') async insights(@CurrentUser() u: User, @Param('id') id: string) {
    return IncidentInsightsSchema.parse(
      await this.insightsService.insights(u, parse(idSchema, id)),
    );
  }
}
