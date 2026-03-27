import {ADT_CLASS_BY_WIDGET_TYPE} from './liferay-resource-list-adts.js';

export type LiferayResourceAdtTypeRow = {
  widgetType: string;
  className: string;
};

export function runLiferayResourceListAdtTypes(): LiferayResourceAdtTypeRow[] {
  return Object.entries(ADT_CLASS_BY_WIDGET_TYPE)
    .map(([widgetType, className]) => ({widgetType, className}))
    .sort((left, right) => left.widgetType.localeCompare(right.widgetType));
}

export function formatLiferayResourceAdtTypes(rows: LiferayResourceAdtTypeRow[]): string {
  if (rows.length === 0) {
    return 'No built-in ADT types';
  }

  return rows
    .map((row) => `${row.widgetType}\t${row.className}`)
    .join('\n');
}
