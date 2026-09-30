import fs from 'node:fs';

const files = [
  'apps/api/src/invitations/invitations.controller.ts',
  'apps/api/src/activities/activities.controller.ts',
  'apps/api/src/search/search.controller.ts',
  'apps/api/src/exports/exports.controller.ts',
  'apps/api/src/api-keys/api-keys.controller.ts',
  'apps/api/src/metadata/metadata.controller.ts',
  'apps/api/src/gdpr/gdpr.controller.ts',
  'apps/api/src/members/members.controller.ts',
  'apps/api/src/automations/automations.controller.ts',
  'apps/api/src/views/views.controller.ts',
  'apps/api/src/webhooks/webhooks.controller.ts',
  'apps/api/src/files/files.controller.ts',
  'apps/api/src/roles/roles.controller.ts',
  'apps/api/src/records/records.controller.ts',
  'apps/api/src/setup/setup.controller.ts',
  'apps/api/src/automations/automations.module.ts',
  'apps/api/src/webhooks/webhooks.module.ts',
  'apps/api/src/common/guards/permission.guard.ts',
];

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const serviceImports = [
    ...src.matchAll(/import type \{ (\w+) \} from ['"]([^'"]+)['"];/g),
  ].filter((m) => /Service$|Reflector$/.test(m[1]));

  if (serviceImports.length === 0) {
    console.log('skip', file);
    continue;
  }

  for (const m of serviceImports) {
    const [full, name, from] = m;
    const quote = full.includes('"') ? '"' : "'";
    src = src.replace(full, `import { ${name} } from ${quote}${from}${quote};`);
  }

  if (!src.includes('Inject')) {
    src = src.replace(
      /import \{ Module, type OnModuleInit \} from '@nestjs\/common';/,
      "import { Inject, Module, type OnModuleInit } from '@nestjs/common';",
    );
    src = src.replace(
      /import \{\n {2}type CanActivate,\n {2}type ExecutionContext,\n {2}ForbiddenException,\n {2}Injectable,\n\} from '@nestjs\/common';/,
      `import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';`,
    );
    src = src.replace(/import \{([^}]+)\} from '@nestjs\/common';/, (all, inner) => {
      if (/\bInject\b/.test(inner)) return all;
      const parts = inner
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      parts.unshift('Inject');
      if (inner.includes('\n')) {
        return `import {\n  ${parts.join(',\n  ')},\n} from '@nestjs/common';`;
      }
      return `import { ${parts.join(', ')} } from '@nestjs/common';`;
    });
  }

  for (const m of serviceImports) {
    const name = m[1];
    if (src.includes(`@Inject(${name})`)) continue;
    const re = new RegExp(`(constructor\\([\\s\\S]*?)(private readonly \\w+: ${name})([,)\\n])`);
    src = src.replace(re, `$1@Inject(${name}) $2$3`);
  }

  fs.writeFileSync(file, src);
  console.log('fixed', file);
}
