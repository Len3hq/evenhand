import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GalleryModule } from './modules/gallery/gallery.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { JudgingModule } from './modules/judging/judging.module.js';
import { SubmissionsModule } from './modules/submissions/submissions.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { TeamsModule } from './modules/teams/teams.module.js';
import { AuditLogModule } from './modules/audit/audit-log.module.js';
import { TransferModule } from './modules/transfer/transfer.module.js';
import { JudgesModule } from './modules/judges/judges.module.js';
import { ExportsModule } from './modules/exports/exports.module.js';
import { RankingsModule } from './modules/rankings/rankings.module.js';
import { IntegrityModule } from './modules/integrity/integrity.module.js';

// Hot file: append one import line per module, never reorder (CONTRIBUTING.md §4).
@Module({
  imports: [
    CoreModule,
    HealthModule,
    AuthModule,
    GalleryModule,
    SubmissionsModule,
    JudgingModule,
    EventsModule,
    TeamsModule,
    AuditLogModule,
    TransferModule,
    JudgesModule,
    ExportsModule,
    RankingsModule,
    IntegrityModule,
  ],
})
export class AppModule {}
