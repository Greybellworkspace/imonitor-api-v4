import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DynamicTableInsertDto } from './dynamic-table.dto';

function toDto(partial: Partial<DynamicTableInsertDto>): DynamicTableInsertDto {
  return plainToInstance(DynamicTableInsertDto, partial);
}

const VALID_INPUT: Partial<DynamicTableInsertDto> = {
  tableName: 'V3_sdp_nodes',
  data: { name: 'SDP-1', hostname: '10.0.0.1' },
};

describe('DynamicTableInsertDto validation', () => {
  it('should pass with valid data', async () => {
    const errors = await validate(toDto(VALID_INPUT));
    expect(errors).toHaveLength(0);
  });

  // ─── tableName ──────────────────────────────────────────────────────────────

  describe('tableName', () => {
    it('should fail when tableName is missing', async () => {
      const errors = await validate(toDto({ data: { name: 'test' } }));
      expect(errors.some((e) => e.property === 'tableName')).toBe(true);
    });

    it('should fail when tableName is empty string', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, tableName: '' }));
      expect(errors.some((e) => e.property === 'tableName')).toBe(true);
    });

    it('should fail when tableName is not a string', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, tableName: 123 as any }));
      expect(errors.some((e) => e.property === 'tableName')).toBe(true);
    });
  });

  // ─── data ───────────────────────────────────────────────────────────────────

  describe('data', () => {
    it('should fail when data is missing', async () => {
      const errors = await validate(toDto({ tableName: 'V3_sdp_nodes' }));
      expect(errors.some((e) => e.property === 'data')).toBe(true);
    });

    it('should fail when data is not an object', async () => {
      const errors = await validate(toDto({ ...VALID_INPUT, data: 'not-object' as any }));
      expect(errors.some((e) => e.property === 'data')).toBe(true);
    });

    it('should pass with an object containing various value types', async () => {
      const errors = await validate(
        toDto({
          tableName: 'V3_sdp_nodes',
          data: { str: 'hello', num: 42, bool: true, nil: null },
        }),
      );
      expect(errors).toHaveLength(0);
    });
  });

  // ─── missing fields ────────────────────────────────────────────────────────

  it('should fail when all required fields are missing', async () => {
    const errors = await validate(toDto({}));
    const props = errors.map((e) => e.property);
    expect(props).toContain('tableName');
    expect(props).toContain('data');
  });
});
