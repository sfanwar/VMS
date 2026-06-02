import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country, VisaType } from '../entities/reference.entity';

@Injectable()
export class ReferenceService {
  constructor(
    @InjectRepository(Country) private readonly countries: Repository<Country>,
    @InjectRepository(VisaType) private readonly visaTypes: Repository<VisaType>,
  ) {}

  // ─── Countries ─────────────────────────────────────────

  listCountries(includeInactive = false): Promise<Country[]> {
    return this.countries.find({
      where: includeInactive ? {} : { isActive: true },
      order: { nameEn: 'ASC' },
    });
  }

  async createCountry(data: { isoCode: string; nameEn: string; nameAr: string }): Promise<Country> {
    const isoCode = data.isoCode.toUpperCase();
    const existing = await this.countries.findOne({ where: { isoCode } });
    if (existing) throw new ConflictException({ errorCode: 'COUNTRY_EXISTS', message: 'A country with this ISO code already exists' });
    return this.countries.save(this.countries.create({ isoCode, nameEn: data.nameEn, nameAr: data.nameAr }));
  }

  async updateCountry(id: string, data: { nameEn?: string; nameAr?: string; isActive?: boolean }): Promise<Country> {
    const country = await this.countries.findOne({ where: { id } });
    if (!country) throw new NotFoundException({ errorCode: 'COUNTRY_NOT_FOUND', message: 'Country not found' });
    if (data.nameEn !== undefined) country.nameEn = data.nameEn;
    if (data.nameAr !== undefined) country.nameAr = data.nameAr;
    if (data.isActive !== undefined) country.isActive = data.isActive;
    return this.countries.save(country);
  }

  // ─── Visa types ────────────────────────────────────────

  listVisaTypes(includeInactive = false): Promise<VisaType[]> {
    return this.visaTypes.find({
      where: includeInactive ? {} : { isActive: true },
      order: { nameEn: 'ASC' },
    });
  }

  async createVisaType(data: { code: string; nameEn: string; nameAr: string }): Promise<VisaType> {
    const code = data.code.toUpperCase();
    const existing = await this.visaTypes.findOne({ where: { code } });
    if (existing) throw new ConflictException({ errorCode: 'VISA_TYPE_EXISTS', message: 'A visa type with this code already exists' });
    return this.visaTypes.save(this.visaTypes.create({ code, nameEn: data.nameEn, nameAr: data.nameAr }));
  }

  async updateVisaType(id: string, data: { nameEn?: string; nameAr?: string; isActive?: boolean }): Promise<VisaType> {
    const visaType = await this.visaTypes.findOne({ where: { id } });
    if (!visaType) throw new NotFoundException({ errorCode: 'VISA_TYPE_NOT_FOUND', message: 'Visa type not found' });
    if (data.nameEn !== undefined) visaType.nameEn = data.nameEn;
    if (data.nameAr !== undefined) visaType.nameAr = data.nameAr;
    if (data.isActive !== undefined) visaType.isActive = data.isActive;
    return this.visaTypes.save(visaType);
  }
}
