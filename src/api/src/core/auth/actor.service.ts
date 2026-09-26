import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { Actor } from './actor.js';

@Injectable()
export class ActorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Builds the Actor for a user, with every event role they hold. Null if the user is gone. */
  async load(userId: string, via: Actor['via']): Promise<Actor | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        eventRoles: { select: { id: true, eventId: true, role: true, externalId: true } },
      },
    });
    if (!user) return null;
    return new Actor(user.id, user.email, user.name, user.isAdmin, via, user.eventRoles);
  }
}
