import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GalleryModule } from './modules/gallery/gallery.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { JudgingModule } from './modules/judging/judging.module.js';
import { SubmissionsModule } from './modules/submissions/submissions.module.js';
import { EventsModule } from './modules/events/events.module.js';

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
  ],
})
export class AppModule {}
