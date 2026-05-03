import { vi } from 'vitest'

export const db = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }])
    })
  }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([])
      })
    })
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([])
    })
  }),
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([])
  }),
  transaction: vi.fn().mockImplementation(async (fn) => fn(db)),
}

export const schema = {}
