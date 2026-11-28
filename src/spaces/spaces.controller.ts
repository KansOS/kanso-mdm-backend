import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {HelperId} from '../auth/helper-id.decorator';
import {SessionAuthGuard} from '../auth/session-auth.guard';
import {CreateContactDto} from './dto/create-contact.dto';
import {CreateDeviceDto} from './dto/create-device.dto';
import {CreateSpaceDto} from './dto/create-space.dto';
import {UpdateContactDto} from './dto/update-contact.dto';
import {UpdateDeviceDto} from './dto/update-device.dto';
import {SpacesService} from './spaces.service';

@Controller('spaces')
@UseGuards(SessionAuthGuard)
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@HelperId() helperId: string, @Body() dto: CreateSpaceDto) {
    return this.spacesService.create(helperId, dto);
  }

  @Get(':spaceId/contacts')
  async findContacts(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
  ) {
    const contacts = await this.spacesService.findContactsForHelper(
      helperId,
      spaceId,
    );
    if (!contacts) {
      throw new NotFoundException('Space not found.');
    }
    return contacts;
  }

  @Post(':spaceId/contacts')
  @HttpCode(HttpStatus.CREATED)
  async createContact(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateContactDto,
  ) {
    const contact = await this.spacesService.createContactForHelper(
      helperId,
      spaceId,
      dto,
    );
    if (!contact) {
      throw new NotFoundException('Space not found.');
    }
    return contact;
  }

  @Patch(':spaceId/contacts/:contactId')
  async updateContact(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateContactDto,
  ) {
    const contact = await this.spacesService.updateContactForHelper(
      helperId,
      spaceId,
      contactId,
      dto,
    );
    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }
    return contact;
  }

  @Delete(':spaceId/contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContact(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
    @Param('contactId') contactId: string,
  ) {
    const deleted = await this.spacesService.deleteContactForHelper(
      helperId,
      spaceId,
      contactId,
    );
    if (!deleted) {
      throw new NotFoundException('Contact not found.');
    }
  }

  @Post(':spaceId/devices')
  @HttpCode(HttpStatus.CREATED)
  async createDevice(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateDeviceDto,
  ) {
    const device = await this.spacesService.createDeviceForHelper(
      helperId,
      spaceId,
      dto.pseudonym,
    );
    if (!device) {
      throw new NotFoundException('Space not found.');
    }
    return device;
  }

  @Get(':spaceId')
  async findOne(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
  ) {
    const space = await this.spacesService.findForHelper(helperId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found.');
    }
    return space;
  }

  @Get(':spaceId/devices')
  async findDevices(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
  ) {
    const devices = await this.spacesService.findDevicesForHelper(
      helperId,
      spaceId,
    );
    if (!devices) {
      throw new NotFoundException('Space not found.');
    }
    return devices;
  }

  @Patch(':spaceId/devices/:deviceId')
  async updateDevice(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    const device = await this.spacesService.updateDeviceForHelper(
      helperId,
      spaceId,
      deviceId,
      dto.pseudonym,
    );
    if (!device) {
      throw new NotFoundException('Device not found.');
    }
    return device;
  }

  @Post(':spaceId/devices/:deviceId/revoke')
  async revokeDevice(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
    @Param('deviceId') deviceId: string,
  ) {
    const device = await this.spacesService.revokeDeviceForHelper(
      helperId,
      spaceId,
      deviceId,
    );
    if (!device) {
      throw new NotFoundException('Device not found.');
    }
    return device;
  }

  @Post(':spaceId/devices/:deviceId/pairing-code')
  async createPairingCode(
    @HelperId() helperId: string,
    @Param('spaceId') spaceId: string,
    @Param('deviceId') deviceId: string,
  ) {
    const pairingCode = await this.spacesService.createPairingCodeForHelper(
      helperId,
      spaceId,
      deviceId,
    );
    if (!pairingCode) {
      throw new NotFoundException('Pending device not found.');
    }
    return pairingCode;
  }
}
