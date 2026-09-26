import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module.js';
import { DemoSeeder } from './demo-seeder.service.js';
import { FixtureImporter } from './fixture-importer.service.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [CoreModule],
  providers: [FixtureImporter, DemoSeeder, SeedService],
  exports: [SeedService],
})
export class SeedModule {}
