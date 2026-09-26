import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller.js';
import { GalleryService } from './gallery.service.js';

@Module({ controllers: [GalleryController], providers: [GalleryService] })
export class GalleryModule {}
