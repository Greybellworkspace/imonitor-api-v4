import { Entity, PrimaryColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CoreWidgetBuilder } from './core-widget-builder.entity';

@Entity('core_shared_widget_builder')
export class CoreSharedWidgetBuilder {
  @PrimaryColumn({ type: 'varchar', length: 36, default: () => 'uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  widgetBuilderId: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  ownerId: string;

  @Column({ type: 'datetime', nullable: true })
  createdAt: Date | null;

  @Column({ type: 'tinyint', width: 1, nullable: true, default: 0 })
  isFavorite: boolean | null;

  @ManyToOne(() => CoreWidgetBuilder, (wb) => wb.sharedWidgetBuilders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'widgetBuilderId' })
  @Index('widgetBuilderId_fk')
  widgetBuilder: CoreWidgetBuilder;
}
