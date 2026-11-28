import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomInt} from 'node:crypto';
import {SecretCipherService} from '../auth/secret-cipher.service';
import {PrismaService} from '../prisma/prisma.service';
import {CreateContactDto} from './dto/create-contact.dto';
import {CreateSpaceDto} from './dto/create-space.dto';
import {UpdateContactDto} from './dto/update-contact.dto';

const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;
const SPACE_SELECT = {id: true, pseudonym: true, createdAt: true} as const;
const CONTACT_SELECT = {
  id: true,
  identifier: true,
  trustLevel: true,
} as const;
const DEVICE_SELECT = {
  id: true,
  pseudonym: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretCipher: SecretCipherService,
  ) {}

  async create(helperId: string, dto: CreateSpaceDto) {
    return this.prisma.space.create({
      data: {
        pseudonym: dto.pseudonym,
        memberships: {create: {helperId}},
      },
      select: SPACE_SELECT,
    });
  }

  async findForHelper(helperId: string, spaceId: string) {
    return this.prisma.space.findFirst({
      where: {id: spaceId, memberships: {some: {helperId}}},
      select: SPACE_SELECT,
    });
  }

  async isMember(helperId: string, spaceId: string): Promise<boolean> {
    const membership = await this.prisma.spaceMembership.findUnique({
      where: {spaceId_helperId: {spaceId, helperId}},
      select: {id: true},
    });
    return membership !== null;
  }

  async ensureMember(helperId: string, spaceId: string): Promise<void> {
    await this.prisma.spaceMembership.upsert({
      where: {spaceId_helperId: {spaceId, helperId}},
      create: {spaceId, helperId},
      update: {},
    });
  }

  async findContactsForHelper(helperId: string, spaceId: string) {
    const space = await this.prisma.space.findFirst({
      where: {id: spaceId, memberships: {some: {helperId}}},
      select: {id: true},
    });

    if (!space) {
      return null;
    }

    return this.prisma.contact.findMany({
      where: {spaceId: space.id},
      orderBy: {id: 'asc'},
      select: CONTACT_SELECT,
    });
  }

  async createContactForHelper(
    helperId: string,
    spaceId: string,
    dto: CreateContactDto,
  ) {
    const space = await this.prisma.space.findFirst({
      where: {id: spaceId, memberships: {some: {helperId}}},
      select: {id: true},
    });

    if (!space) {
      return null;
    }

    return this.prisma.contact.create({
      data: {
        spaceId: space.id,
        identifier: dto.identifier,
        trustLevel: dto.trustLevel,
      },
      select: CONTACT_SELECT,
    });
  }

  async updateContactForHelper(
    helperId: string,
    spaceId: string,
    contactId: string,
    dto: UpdateContactDto,
  ) {
    if (dto.identifier === undefined && dto.trustLevel === undefined) {
      throw new BadRequestException(
        'At least one contact field must be provided.',
      );
    }

    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        spaceId,
        space: {memberships: {some: {helperId}}},
      },
      select: {id: true},
    });

    if (!contact) {
      return null;
    }

    return this.prisma.contact.update({
      where: {id: contact.id},
      data: {
        ...(dto.identifier !== undefined ? {identifier: dto.identifier} : {}),
        ...(dto.trustLevel !== undefined ? {trustLevel: dto.trustLevel} : {}),
      },
      select: CONTACT_SELECT,
    });
  }

  async deleteContactForHelper(
    helperId: string,
    spaceId: string,
    contactId: string,
  ): Promise<boolean> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        spaceId,
        space: {memberships: {some: {helperId}}},
      },
      select: {id: true},
    });

    if (!contact) {
      return false;
    }

    await this.prisma.contact.delete({where: {id: contact.id}});
    return true;
  }

  async findDevicesForHelper(helperId: string, spaceId: string) {
    const space = await this.prisma.space.findFirst({
      where: {id: spaceId, memberships: {some: {helperId}}},
      select: {id: true},
    });

    if (!space) {
      return null;
    }

    return this.prisma.device.findMany({
      where: {spaceId},
      orderBy: {createdAt: 'asc'},
      select: DEVICE_SELECT,
    });
  }

  async createDeviceForHelper(
    helperId: string,
    spaceId: string,
    pseudonym: string,
  ) {
    const space = await this.prisma.space.findFirst({
      where: {id: spaceId, memberships: {some: {helperId}}},
      select: {id: true},
    });

    if (!space) {
      return null;
    }

    try {
      return await this.prisma.device.create({
        data: {
          spaceId: space.id,
          pseudonym,
        },
        select: DEVICE_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A device with this pseudonym already exists in this space.',
        );
      }
      throw error;
    }
  }

  async updateDeviceForHelper(
    helperId: string,
    spaceId: string,
    deviceId: string,
    pseudonym: string,
  ) {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        spaceId,
        space: {memberships: {some: {helperId}}},
      },
      select: {id: true},
    });

    if (!device) {
      return null;
    }

    try {
      return await this.prisma.device.update({
        where: {id: device.id},
        data: {pseudonym},
        select: DEVICE_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A device with this pseudonym already exists in this space.',
        );
      }
      throw error;
    }
  }

  async revokeDeviceForHelper(
    helperId: string,
    spaceId: string,
    deviceId: string,
  ) {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        spaceId,
        space: {memberships: {some: {helperId}}},
      },
      select: {id: true},
    });

    if (!device) {
      return null;
    }

    return this.prisma.device.update({
      where: {id: device.id},
      data: {status: 'REVOKED'},
      select: DEVICE_SELECT,
    });
  }

  async createPairingCodeForHelper(
    helperId: string,
    spaceId: string,
    deviceId: string,
  ) {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        spaceId,
        status: 'PENDING',
        space: {memberships: {some: {helperId}}},
      },
      select: {id: true},
    });

    if (!device) {
      return null;
    }

    const code = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

    const pairingCode = await this.prisma.$transaction(async tx => {
      await tx.devicePairingCode.deleteMany({
        where: {deviceId, usedAt: null},
      });
      return tx.devicePairingCode.create({
        data: {
          deviceId,
          codeHash: this.secretCipher.hashPairingCode(code),
          expiresAt,
        },
        select: {expiresAt: true},
      });
    });

    return {code, expiresAt: pairingCode.expiresAt};
  }
}
