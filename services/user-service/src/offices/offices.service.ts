import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Office } from '../entities/office.entity';
import { OfficeContact } from '../entities/office-contact.entity';

export interface ContactData {
  name?: string;
  telephoneNumber?: string;
  isPrimary?: boolean;
  isActive?: boolean;
}

@Injectable()
export class OfficesService {
  constructor(
    @InjectRepository(Office) private readonly offices: Repository<Office>,
    @InjectRepository(OfficeContact) private readonly contacts: Repository<OfficeContact>,
  ) {}

  /** Order an office's contacts: primary first, then alphabetical. Active only. */
  private orderContacts(office: Office): Office {
    office.contacts = (office.contacts ?? [])
      .filter((c) => c.isActive)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
    return office;
  }

  async findAll(): Promise<Office[]> {
    const offices = await this.offices.find({
      where: { isActive: true },
      order: { nameEn: 'ASC' },
      relations: { contacts: true },
    });
    return offices.map((o) => this.orderContacts(o));
  }

  /** Like findAll but includes inactive offices — for the admin screen. */
  async findAllForAdmin(): Promise<Office[]> {
    const offices = await this.offices.find({ order: { nameEn: 'ASC' }, relations: { contacts: true } });
    return offices.map((o) => this.orderContacts(o));
  }

  async findById(id: string): Promise<Office> {
    const office = await this.offices.findOne({ where: { id }, relations: { contacts: true } });
    if (!office) throw new NotFoundException({ errorCode: 'OFFICE_NOT_FOUND', message: 'Office not found' });
    return this.orderContacts(office);
  }

  async create(data: Partial<Office>): Promise<Office> {
    const saved = await this.offices.save(this.offices.create(data));
    // Mirror the office's primary authorized person into office_contacts so it
    // appears in the request-create contact dropdown alongside any others.
    if (data.authorizedPerson && data.telephoneNumber) {
      await this.contacts.save(
        this.contacts.create({
          officeId: saved.id,
          name: data.authorizedPerson,
          telephoneNumber: data.telephoneNumber,
          isPrimary: true,
        }),
      );
    }
    return this.findById(saved.id);
  }

  async update(id: string, data: Partial<Office>): Promise<Office> {
    const office = await this.offices.findOne({ where: { id } });
    if (!office) throw new NotFoundException({ errorCode: 'OFFICE_NOT_FOUND', message: 'Office not found' });
    for (const key of ['nameEn', 'nameAr', 'authorizedPerson', 'telephoneNumber', 'isActive'] as const) {
      if (data[key] !== undefined) (office as any)[key] = data[key];
    }
    await this.offices.save(office);
    return this.findById(id);
  }

  // ─── Contacts ──────────────────────────────────────────

  async addContact(officeId: string, data: ContactData): Promise<Office> {
    await this.assertOfficeExists(officeId);
    if (data.isPrimary) await this.clearPrimary(officeId);
    await this.contacts.save(
      this.contacts.create({
        officeId,
        name: data.name,
        telephoneNumber: data.telephoneNumber,
        isPrimary: data.isPrimary ?? false,
      }),
    );
    return this.findById(officeId);
  }

  async updateContact(officeId: string, contactId: string, data: ContactData): Promise<Office> {
    const contact = await this.contacts.findOne({ where: { id: contactId, officeId } });
    if (!contact) throw new NotFoundException({ errorCode: 'CONTACT_NOT_FOUND', message: 'Contact not found' });
    if (data.isPrimary) await this.clearPrimary(officeId);
    if (data.name !== undefined) contact.name = data.name;
    if (data.telephoneNumber !== undefined) contact.telephoneNumber = data.telephoneNumber;
    if (data.isPrimary !== undefined) contact.isPrimary = data.isPrimary;
    if (data.isActive !== undefined) contact.isActive = data.isActive;
    await this.contacts.save(contact);
    return this.findById(officeId);
  }

  async removeContact(officeId: string, contactId: string): Promise<Office> {
    const contact = await this.contacts.findOne({ where: { id: contactId, officeId } });
    if (!contact) throw new NotFoundException({ errorCode: 'CONTACT_NOT_FOUND', message: 'Contact not found' });
    await this.contacts.delete({ id: contactId });
    return this.findById(officeId);
  }

  private async clearPrimary(officeId: string): Promise<void> {
    await this.contacts.update({ officeId, isPrimary: true }, { isPrimary: false });
  }

  private async assertOfficeExists(officeId: string): Promise<void> {
    const exists = await this.offices.findOne({ where: { id: officeId } });
    if (!exists) throw new NotFoundException({ errorCode: 'OFFICE_NOT_FOUND', message: 'Office not found' });
  }
}
