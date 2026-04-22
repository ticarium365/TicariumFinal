export interface Supplier {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  contactPerson: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  openingBalance: number;
  currentBalance: number;
  isActive: boolean;
  notes: string | null;
}
