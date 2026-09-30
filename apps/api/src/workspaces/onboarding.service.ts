import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  count,
  eq,
  fieldDefinitions,
  instanceLicense,
  invitations,
  isNull,
  memberships,
  objectDefinitions,
  records,
  webhookSubscriptions,
  withWorkspace,
  workspaces,
  type AppDatabase,
  type OnboardingChecklistState,
} from '@cragfoge/db';
import {
  listIndustryTemplateSummaries,
  onboardingChecklistSchema,
  patchOnboardingBodySchema,
  type OnboardingChecklist,
  type OnboardingChecklistStepId,
  type PatchOnboardingBody,
} from '@cragfoge/shared';
import { APP_DB } from '../tokens';
import { WorkspacesService } from './workspaces.service';

const STEP_IDS: OnboardingChecklistStepId[] = [
  'import_contacts',
  'invite_team',
  'customize_fields',
  'create_record',
  'connect_integration',
];

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(WorkspacesService) private readonly workspacesService: WorkspacesService,
  ) {}

  listTemplates() {
    return listIndustryTemplateSummaries();
  }

  async getChecklist(userId: string, workspaceId: string): Promise<OnboardingChecklist> {
    await this.workspacesService.getForUser(userId, workspaceId);
    return withWorkspace(workspaceId, async (tx) => {
      const [workspace] = await tx
        .select({
          onboardingChecklist: workspaces.onboardingChecklist,
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }
      const state = (workspace.onboardingChecklist ?? {}) as OnboardingChecklistState;
      const derived = await this.deriveCompleted(tx, workspaceId);
      return this.mergeChecklist(state, derived);
    });
  }

  async patchChecklist(
    userId: string,
    workspaceId: string,
    body: PatchOnboardingBody,
  ): Promise<OnboardingChecklist> {
    const input = patchOnboardingBodySchema.parse(body);
    await this.workspacesService.getForUser(userId, workspaceId);

    const [current] = await this.db
      .select({ onboardingChecklist: workspaces.onboardingChecklist })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!current) {
      throw new NotFoundException('Workspace not found');
    }
    const state: OnboardingChecklistState = {
      ...(current.onboardingChecklist ?? {}),
    };
    const dismissed = new Set(state.dismissedSteps ?? []);
    const completed = new Set(state.completedSteps ?? []);
    if (input.dismissStep) {
      dismissed.add(input.dismissStep);
    }
    if (input.completeStep) {
      completed.add(input.completeStep);
    }
    if (input.dismissedAll !== undefined) {
      state.dismissedAll = input.dismissedAll;
    }
    state.dismissedSteps = [...dismissed];
    state.completedSteps = [...completed];

    await this.db
      .update(workspaces)
      .set({ onboardingChecklist: state })
      .where(eq(workspaces.id, workspaceId));

    return this.getChecklist(userId, workspaceId);
  }

  private mergeChecklist(
    state: OnboardingChecklistState,
    derived: Set<OnboardingChecklistStepId>,
  ): OnboardingChecklist {
    const dismissed = new Set(state.dismissedSteps ?? []);
    const forcedComplete = new Set(state.completedSteps ?? []);
    return onboardingChecklistSchema.parse({
      dismissedAll: state.dismissedAll ?? false,
      steps: STEP_IDS.map((id) => ({
        id,
        completed: derived.has(id) || forcedComplete.has(id),
        dismissed: dismissed.has(id),
      })),
    });
  }

  private async deriveCompleted(
    tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
    workspaceId: string,
  ): Promise<Set<OnboardingChecklistStepId>> {
    const completed = new Set<OnboardingChecklistStepId>();

    const [peopleObject] = await tx
      .select({ id: objectDefinitions.id })
      .from(objectDefinitions)
      .where(and(eq(objectDefinitions.workspaceId, workspaceId), eq(objectDefinitions.apiName, 'people')))
      .limit(1);

    if (peopleObject) {
      const [peopleCount] = await tx
        .select({ value: count() })
        .from(records)
        .where(
          and(
            eq(records.workspaceId, workspaceId),
            eq(records.objectId, peopleObject.id),
            isNull(records.deletedAt),
          ),
        );
      if (Number(peopleCount?.value ?? 0) > 0) {
        completed.add('import_contacts');
      }
    }

    const [memberCount] = await tx
      .select({ value: count() })
      .from(memberships)
      .where(eq(memberships.workspaceId, workspaceId));
    const [inviteCount] = await tx
      .select({ value: count() })
      .from(invitations)
      .where(eq(invitations.workspaceId, workspaceId));
    if (Number(memberCount?.value ?? 0) > 1 || Number(inviteCount?.value ?? 0) > 0) {
      completed.add('invite_team');
    }

    const [customFieldCount] = await tx
      .select({ value: count() })
      .from(fieldDefinitions)
      .where(
        and(
          eq(fieldDefinitions.workspaceId, workspaceId),
          eq(fieldDefinitions.isSystem, false),
          isNull(fieldDefinitions.deletedAt),
        ),
      );
    if (Number(customFieldCount?.value ?? 0) > 0) {
      completed.add('customize_fields');
    }

    const [recordCount] = await tx
      .select({ value: count() })
      .from(records)
      .where(and(eq(records.workspaceId, workspaceId), isNull(records.deletedAt)));
    if (Number(recordCount?.value ?? 0) > 0) {
      completed.add('create_record');
    }

    const [webhookCount] = await tx
      .select({ value: count() })
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.workspaceId, workspaceId));
    const [license] = await this.db.select({ id: instanceLicense.id }).from(instanceLicense).limit(1);
    if (Number(webhookCount?.value ?? 0) > 0 || license) {
      completed.add('connect_integration');
    }

    return completed;
  }
}
