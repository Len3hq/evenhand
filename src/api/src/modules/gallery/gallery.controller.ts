import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/auth/decorators.js';
import { GalleryQueryDto, ProjectDetailDto, ProjectPageDto } from './dto/gallery.dto.js';
import { GalleryService } from './gallery.service.js';

@ApiTags('gallery')
@Controller('projects')
export class GalleryController {
  constructor(private readonly gallery: GalleryService) {}

  /** Public gallery with search and filters. Acceptance checks 1 and 2 read this route. */
  @Public()
  @Get()
  list(@Query() query: GalleryQueryDto): Promise<ProjectPageDto> {
    return this.gallery.list(query);
  }

  /** One public project, by internal id or fixture id (e.g. prj_01). */
  @Public()
  @Get(':ref')
  get(@Param('ref') ref: string): Promise<ProjectDetailDto> {
    return this.gallery.get(ref);
  }
}
