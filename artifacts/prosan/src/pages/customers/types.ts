export interface Customer {
  id: number;
  code: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  contactPerson: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  creditLimit: number;
  currentBalance: number;
  openingBalance: number;
  isActive: boolean;
  notes: string | null;
}
