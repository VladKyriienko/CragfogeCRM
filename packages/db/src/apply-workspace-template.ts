import {
  getIndustryTemplate,
  type IndustryTemplate,
  type IndustryTemplateId,
} from '@cragfoge/shared';
import type { TenantTransaction } from './client';
import { automations } from './schema/automations';
import { fieldDefinitions, objectDefinitions } from './schema/objects';
import { roleObjectPermissions } from './schema/permissions';
import { recordRelations, records } from './schema/records';
import { roles } from './schema/roles';
import { views } from './schema/views';

type SeededObject = {
  id: string;
  apiName: string;
};

export async function applyWorkspaceTemplate(
  tx: TenantTransaction,
  input: {
    workspaceId: string;
    ownerUserId: string;
    templateId: IndustryTemplateId;
    includeSampleData: boolean;
    currency: string;
  },
): Promise<SeededObject[]> {
  const template = getIndustryTemplate(input.templateId);
  return seedFromTemplate(tx, {
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    template,
    includeSampleData: input.includeSampleData,
    currency: input.currency,
  });
}

async function seedFromTemplate(
  tx: TenantTransaction,
  input: {
    workspaceId: string;
    ownerUserId: string;
    template: IndustryTemplate;
    includeSampleData: boolean;
    currency: string;
  },
): Promise<SeededObject[]> {
  const { workspaceId, ownerUserId, template, includeSampleData, currency } = input;

  const objectRows = await tx
    .insert(objectDefinitions)
    .values(
      template.objects.map((object) => ({
        workspaceId,
        apiName: object.apiName,
        labelSingular: object.labelSingular,
        labelPlural: object.labelPlural,
        icon: object.icon,
        isSystem: object.isSystem ?? false,
      })),
    )
    .returning();

  const objectsByApiName = new Map(objectRows.map((row) => [row.apiName, row]));

  const fieldRows = await tx
    .insert(fieldDefinitions)
    .values(
      template.fields.map((field) => {
        const object = objectsByApiName.get(field.objectApiName);
        if (!object) {
          throw new Error(`Template field references unknown object ${field.objectApiName}`);
        }
        return {
          workspaceId,
          objectId: object.id,
          apiName: field.apiName,
          label: field.label,
          type: field.type,
          required: field.required ?? false,
          isSystem: true,
          options: field.options ?? {},
          position: field.position,
        };
      }),
    )
    .returning();

  const fieldsByObjectAndApi = new Map(
    fieldRows.map((row) => {
      const object = objectRows.find((o) => o.id === row.objectId);
      return [`${object?.apiName}:${row.apiName}`, row] as const;
    }),
  );

  const roleRows = await tx.select().from(roles);
  const permissionValues = [];
  for (const role of roleRows) {
    for (const object of objectRows) {
      if (role.key === 'owner' || role.key === 'admin') {
        permissionValues.push({
          workspaceId,
          roleId: role.id,
          objectId: object.id,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
          scope: 'all' as const,
        });
      } else if (role.key === 'member') {
        permissionValues.push({
          workspaceId,
          roleId: role.id,
          objectId: object.id,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: false,
          scope: 'own' as const,
        });
      }
    }
  }
  if (permissionValues.length > 0) {
    await tx.insert(roleObjectPermissions).values(permissionValues);
  }

  if (template.views.length > 0) {
    await tx.insert(views).values(
      template.views.map((view) => {
        const object = objectsByApiName.get(view.objectApiName);
        if (!object) {
          throw new Error(`Template view references unknown object ${view.objectApiName}`);
        }
        return {
          workspaceId,
          objectId: object.id,
          name: view.name,
          columns: view.columns,
          filters: view.filters ?? null,
          sort: view.sort ?? null,
          isShared: view.isShared,
          ownerId: ownerUserId,
        };
      }),
    );
  }

  if (template.automations.length > 0) {
    await tx.insert(automations).values(
      template.automations.map((automation) => {
        const object = objectsByApiName.get(automation.objectApiName);
        if (!object) {
          throw new Error(
            `Template automation references unknown object ${automation.objectApiName}`,
          );
        }
        return {
          workspaceId,
          objectId: object.id,
          name: automation.name,
          trigger: automation.trigger,
          conditions: automation.conditions ?? null,
          actions: automation.actions,
          isActive: automation.isActive,
          createdBy: ownerUserId,
        };
      }),
    );
  }

  if (includeSampleData && template.sampleRecords.length > 0) {
    const createdByName = new Map<string, string>();
    for (const sample of template.sampleRecords) {
      const object = objectsByApiName.get(sample.objectApiName);
      if (!object) {
        throw new Error(`Sample record references unknown object ${sample.objectApiName}`);
      }
      const data: Record<string, unknown> = { ...sample.data };
      for (const [key, value] of Object.entries(data)) {
        if (
          value &&
          typeof value === 'object' &&
          'amount' in value &&
          'currency' in value &&
          (value as { currency: unknown }).currency === 'USD'
        ) {
          data[key] = {
            ...(value as Record<string, unknown>),
            currency,
          };
        }
      }

      const [created] = await tx
        .insert(records)
        .values({
          workspaceId,
          objectId: object.id,
          name: sample.name,
          ownerId: ownerUserId,
          createdBy: ownerUserId,
          data,
        })
        .returning();
      if (!created) {
        throw new Error(`Failed to create sample record ${sample.name}`);
      }
      createdByName.set(`${sample.objectApiName}:${sample.name}`, created.id);

      if (sample.relations) {
        for (const [fieldApiName, relatedName] of Object.entries(sample.relations)) {
          const field = fieldsByObjectAndApi.get(`${sample.objectApiName}:${fieldApiName}`);
          if (!field || field.type !== 'relation') {
            throw new Error(`Sample relation field missing: ${fieldApiName}`);
          }
          const relatedObjectApiName =
            typeof field.options.relatedObjectApiName === 'string'
              ? field.options.relatedObjectApiName
              : undefined;
          if (!relatedObjectApiName) {
            throw new Error(`Relation field ${fieldApiName} missing relatedObjectApiName`);
          }
          const relatedId = createdByName.get(`${relatedObjectApiName}:${relatedName}`);
          if (!relatedId) {
            throw new Error(
              `Sample relation target not found: ${relatedObjectApiName}:${relatedName}`,
            );
          }
          await tx.insert(recordRelations).values({
            workspaceId,
            fieldId: field.id,
            fromRecordId: created.id,
            toRecordId: relatedId,
          });
        }
      }
    }
  }

  return objectRows.map((row) => ({ id: row.id, apiName: row.apiName }));
}

/**
 * @deprecated Prefer {@link applyWorkspaceTemplate}. Kept for callers that expect the old name.
 */
export async function seedWorkspaceMetadata(
  tx: TenantTransaction,
  workspaceId: string,
  ownerUserId?: string,
): Promise<SeededObject[]> {
  return applyWorkspaceTemplate(tx, {
    workspaceId,
    ownerUserId: ownerUserId ?? 'system',
    templateId: 'generic-sales',
    includeSampleData: false,
    currency: 'USD',
  });
}
