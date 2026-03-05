/**
 * Threshold helper utilities for widget builder charts.
 * Ported from v3 core/utils/threshold.util.ts.
 *
 * Calculate threshold ranges based on time intervals, and construct
 * threshold-colored chart values for counter, bar, percentage, and tabular charts.
 */

import { DateHelperService } from '../../../shared/services/date-helper.service';
import { ThresholdOperator } from '../../reports/enums';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface IThresholdTimeInterval {
  startTime: string;
  endTime: string;
  options: {
    lowerRange: number;
    upperRange: number;
    operator?: string;
    value?: number;
    customValue?: unknown;
    whenField?: string;
  };
}

export interface IThresholdSettings {
  alternativeTimeInterval: {
    lowerRange: number;
    upperRange: number;
  };
  timeIntervals: IThresholdTimeInterval[];
}

export interface IThresholdTime {
  settings: IThresholdSettings;
  colors?: IThresholdColors;
}

export interface IThresholdTimeAndTotal extends IThresholdTime {
  settings: IThresholdSettings & {
    alternativeTimeInterval: {
      lowerRange: number;
      upperRange: number;
    };
  };
}

export interface IThresholdColors {
  lowerRange: string;
  midRange: string;
  upperRange: string;
}

export interface IThresholdRange {
  lowerRange: number;
  upperRange: number;
}

export interface ICalculatedThreshold extends IThresholdRange {
  colors?: IThresholdColors;
}

export interface ITabularThresholdResult extends IThresholdRange {
  elseLowerRange: number;
  elseUpperRange: number;
  customValue?: unknown;
  operator?: string;
  value?: number;
  whenField?: string;
}

export interface IChartValueWithThreshold {
  value: number;
  itemStyle?: { color: string };
}

// ---------------------------------------------------------------------------
// calculateThresholdResultByTime
// ---------------------------------------------------------------------------

export function calculateThresholdResultByTime(
  threshold: IThresholdTime,
  dateHelper: DateHelperService,
): IThresholdRange | null {
  if (!threshold?.settings) return null;

  const settings = threshold.settings;
  const result: IThresholdRange = {
    lowerRange: settings.alternativeTimeInterval.lowerRange,
    upperRange: settings.alternativeTimeInterval.upperRange,
  };

  for (const time of settings.timeIntervals) {
    if (dateHelper.isWithinDateRange(dateHelper.currentDate(), time.startTime, time.endTime)) {
      result.lowerRange = time.options.lowerRange;
      result.upperRange = time.options.upperRange;
      return result;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// calculateThresholdResultByTimeAndTotal
// ---------------------------------------------------------------------------

export function calculateThresholdResultByTimeAndTotal(
  threshold: IThresholdTimeAndTotal,
  totalField: number,
  dateHelper: DateHelperService,
): IThresholdRange {
  const settings = threshold.settings;
  const result: IThresholdRange = {
    lowerRange: settings.alternativeTimeInterval.lowerRange,
    upperRange: settings.alternativeTimeInterval.upperRange,
  };

  for (const time of settings.timeIntervals) {
    if (dateHelper.isWithinDateRange(dateHelper.currentDate(), time.startTime, time.endTime)) {
      if (time.options.operator === ThresholdOperator.LESS_THAN) {
        if (totalField < time.options.value!) {
          result.lowerRange = time.options.lowerRange;
          result.upperRange = time.options.upperRange;
        }
      } else if (time.options.operator === ThresholdOperator.EQUAL) {
        if (totalField === time.options.value) {
          result.lowerRange = time.options.lowerRange;
          result.upperRange = time.options.upperRange;
        }
      } else if (time.options.operator === ThresholdOperator.GREATER) {
        if (totalField > time.options.value!) {
          result.lowerRange = time.options.lowerRange;
          result.upperRange = time.options.upperRange;
        }
      }
      return result;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// constructTabularThreshold
// ---------------------------------------------------------------------------

export function constructTabularThreshold(threshold: IThresholdTime): ITabularThresholdResult | null {
  if (!threshold || Object.keys(threshold).length <= 0) return null;
  if (!threshold.settings) return null;

  const settings = threshold.settings;
  let result: ITabularThresholdResult = {
    lowerRange: settings.alternativeTimeInterval.lowerRange,
    upperRange: settings.alternativeTimeInterval.upperRange,
    elseLowerRange: settings.alternativeTimeInterval.lowerRange,
    elseUpperRange: settings.alternativeTimeInterval.upperRange,
  };

  // Note: tabular thresholds do not use dateHelper for time-range checking in WB context
  // They check against the settings directly. In v3, dateHelper was used but the
  // alternativeTimeInterval fallback is the common path for widget builders.
  for (const time of (settings as IThresholdSettings).timeIntervals) {
    // For tabular charts, we take the first time interval's full options
    result = {
      lowerRange: time.options.lowerRange,
      upperRange: time.options.upperRange,
      customValue: time.options.customValue,
      operator: time.options.operator,
      value: time.options.value,
      whenField: time.options.whenField,
      elseLowerRange: settings.alternativeTimeInterval.lowerRange,
      elseUpperRange: settings.alternativeTimeInterval.upperRange,
    };
    return result;
  }

  return result;
}

// ---------------------------------------------------------------------------
// constructThresholdResult
// ---------------------------------------------------------------------------

export function constructThresholdResult(
  dataFieldValue: number,
  threshold: ICalculatedThreshold | null | undefined,
): IChartValueWithThreshold {
  const value: IChartValueWithThreshold = { value: dataFieldValue };

  if (!threshold?.colors) return value;

  if (dataFieldValue < threshold.lowerRange) {
    value.itemStyle = { color: threshold.colors.lowerRange };
  } else if (dataFieldValue > threshold.upperRange) {
    value.itemStyle = { color: threshold.colors.upperRange };
  } else {
    value.itemStyle = { color: threshold.colors.midRange };
  }

  return value;
}
