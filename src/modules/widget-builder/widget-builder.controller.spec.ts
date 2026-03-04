import { Test, TestingModule } from '@nestjs/testing';
import { WidgetBuilderController } from './widget-builder.controller';
import { WidgetBuilderService } from './widget-builder.service';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';

// ─── Mock Service ─────────────────────────────────────────────────────────

const mockWidgetBuilderService = {
  privilegedStatisticTables: jest.fn(),
  list: jest.fn(),
  getById: jest.fn(),
  getSharedById: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  rename: jest.fn(),
  favorite: jest.fn(),
  changeOwner: jest.fn(),
  delete: jest.fn(),
  share: jest.fn(),
  saveSharedWidgetBuilder: jest.fn(),
  hasAccess: jest.fn(),
  closeTab: jest.fn(),
};

// ─── Test Data ────────────────────────────────────────────────────────────

const USER_ID = 'user-123';
const WB_ID = 'wb-456';
const CHART_ID = 'chart-789';

// ─── Test Suite ───────────────────────────────────────────────────────────

describe('WidgetBuilderController', () => {
  let controller: WidgetBuilderController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WidgetBuilderController],
      providers: [{ provide: WidgetBuilderService, useValue: mockWidgetBuilderService }],
    })
      .overrideGuard(PrivilegeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WidgetBuilderController>(WidgetBuilderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── CRUD ─────────────────────────────────────────────────────────────

  describe('getPrivilegedTables', () => {
    it('should delegate to service.privilegedStatisticTables', () => {
      controller.getPrivilegedTables(USER_ID);
      expect(mockWidgetBuilderService.privilegedStatisticTables).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('list', () => {
    it('should delegate to service.list', () => {
      controller.list(USER_ID);
      expect(mockWidgetBuilderService.list).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('getById', () => {
    it('should delegate to service.getById with id and userId', () => {
      controller.getById(WB_ID, USER_ID);
      expect(mockWidgetBuilderService.getById).toHaveBeenCalledWith(WB_ID, USER_ID);
    });
  });

  describe('getSharedById', () => {
    it('should delegate to service.getSharedById with id', () => {
      controller.getSharedById('shared-1');
      expect(mockWidgetBuilderService.getSharedById).toHaveBeenCalledWith('shared-1');
    });
  });

  describe('save', () => {
    it('should delegate to service.save with dto and userId', () => {
      const dto = { name: 'Test WB' } as any;
      controller.save(dto, USER_ID);
      expect(mockWidgetBuilderService.save).toHaveBeenCalledWith(dto, USER_ID);
    });
  });

  describe('update', () => {
    it('should delegate to service.update with dto and userId', () => {
      const dto = { id: WB_ID, name: 'Updated' } as any;
      controller.update(dto, USER_ID);
      expect(mockWidgetBuilderService.update).toHaveBeenCalledWith(dto, USER_ID);
    });
  });

  describe('deleteWidgetBuilder', () => {
    it('should delegate to service.delete with userId and id', () => {
      controller.deleteWidgetBuilder(WB_ID, USER_ID);
      expect(mockWidgetBuilderService.delete).toHaveBeenCalledWith(USER_ID, WB_ID);
    });
  });

  // ─── Sharing ──────────────────────────────────────────────────────────

  describe('share', () => {
    it('should delegate to service.share with id and dto', () => {
      const dto = { userIds: ['u1', 'u2'] } as any;
      controller.share(WB_ID, dto);
      expect(mockWidgetBuilderService.share).toHaveBeenCalledWith(WB_ID, dto);
    });
  });

  describe('saveSharedWidgetBuilder', () => {
    it('should delegate to service.saveSharedWidgetBuilder with id and userId', () => {
      controller.saveSharedWidgetBuilder('shared-1', USER_ID);
      expect(mockWidgetBuilderService.saveSharedWidgetBuilder).toHaveBeenCalledWith('shared-1', USER_ID);
    });
  });

  // ─── Management ───────────────────────────────────────────────────────

  describe('rename', () => {
    it('should delegate to service.rename with dto and userId', () => {
      const dto = { widgetBuilderId: WB_ID, name: 'New Name' } as any;
      controller.rename(dto, USER_ID);
      expect(mockWidgetBuilderService.rename).toHaveBeenCalledWith(dto, USER_ID);
    });
  });

  describe('favorite', () => {
    it('should delegate to service.favorite with id and isShared=true', () => {
      controller.favorite(WB_ID, 'true');
      expect(mockWidgetBuilderService.favorite).toHaveBeenCalledWith(WB_ID, true);
    });

    it('should pass isShared=false when query param is not "true"', () => {
      controller.favorite(WB_ID, 'false');
      expect(mockWidgetBuilderService.favorite).toHaveBeenCalledWith(WB_ID, false);
    });
  });

  describe('changeOwner', () => {
    it('should delegate to service.changeOwner with dto and userId', () => {
      const dto = { widgetBuilderId: WB_ID, newOwnerId: 'user-2' } as any;
      controller.changeOwner(dto, USER_ID);
      expect(mockWidgetBuilderService.changeOwner).toHaveBeenCalledWith(dto, USER_ID);
    });
  });

  describe('access', () => {
    it('should delegate to service.hasAccess with widgetBuilderId and userId', () => {
      controller.access(WB_ID, USER_ID);
      expect(mockWidgetBuilderService.hasAccess).toHaveBeenCalledWith(WB_ID, USER_ID);
    });
  });

  describe('closeTab', () => {
    it('should delegate to service.closeTab with wbId and chartId', () => {
      controller.closeTab(WB_ID, CHART_ID);
      expect(mockWidgetBuilderService.closeTab).toHaveBeenCalledWith(WB_ID, CHART_ID);
    });
  });
});
