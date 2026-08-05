import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
/**
 * COMPOSANT SANS APPELANT.
 * ---------------------------------------------------------------------------
 * Rien n'importe ce fichier, et `fiscal_deadline_cards` n'est plus lue nulle
 * part dans le front : il reste de l'écran « Échéances fiscales », retiré avec
 * les cinq entrées de menu mortes signalées par coherence.test.ts. Il importait
 * d'ailleurs `FiscalDeadlineCardWithDetails`, type disparu de database.ts avec
 * la fonctionnalité — ce fichier n'a donc jamais pu compiler depuis.
 *
 * La forme attendue est déclarée ici, au plus près de son seul usage, plutôt que
 * de réintroduire dans les types générés une entrée que la base ne justifie
 * plus. Le vrai geste serait de supprimer le fichier.
 */
interface FiscalDeadlineCardWithDetails {
  id: string;
  column_id: string;
  date_echeance: string | null;
  clients?: { nom_entreprise: string | null } | null;
}

interface Props {
  cards: FiscalDeadlineCardWithDetails[];
  columns: { id: string; name: string; color: string }[];
  onCardClick?: (card: FiscalDeadlineCardWithDetails) => void;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export function FiscalDeadlineCalendar({ cards, columns, onCardClick }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const cardsByDay = useMemo(() => {
    const map = new Map<string, FiscalDeadlineCardWithDetails[]>();
    for (const card of cards) {
      if (!card.date_echeance) continue;
      const date = new Date(card.date_echeance);
      if (date.getFullYear() === year && date.getMonth() === month) {
        const key = `${date.getDate()}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(card);
      }
    }
    return map;
  }, [cards, year, month]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getColumnColor = (card: FiscalDeadlineCardWithDetails): string => {
    const col = columns.find(c => c.id === card.column_id);
    return col?.color || '#6b7280';
  };

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {MONTHS_FR[month]} {year}
          </h3>
          <button
            onClick={goToToday}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Aujourd'hui
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {/* Empty cells for days before first of month */}
          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dayCards = cardsByDay.get(`${day}`) || [];
            const isToday = isCurrentMonth && today.getDate() === day;
            const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

            return (
              <div
                key={day}
                className={`min-h-[100px] border-b border-r border-gray-100 dark:border-gray-800 p-1.5 transition-colors ${
                  isToday ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''
                } ${isPast && !isToday ? 'bg-gray-50/30 dark:bg-gray-900/20' : ''}`}
              >
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday
                    ? 'bg-teal-600 text-white dark:bg-teal-500'
                    : isPast
                      ? 'text-gray-400 dark:text-gray-600'
                      : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {day}
                </div>
                <div className="space-y-0.5 overflow-y-auto max-h-[72px]">
                  {dayCards.slice(0, 3).map((card) => {
                    return (
                      <button
                        key={card.id}
                        onClick={() => onCardClick?.(card)}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium truncate transition-all hover:opacity-80 hover:scale-[1.02]"
                        style={{
                          backgroundColor: `${getColumnColor(card)}20`,
                          color: getColumnColor(card),
                          borderLeft: `2px solid ${getColumnColor(card)}`,
                        }}
                        title={card.clients?.nom_entreprise || ''}
                      >
                        {card.clients?.nom_entreprise || 'Client'}
                      </button>
                    );
                  })}
                  {dayCards.length > 3 && (
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 pl-1.5 font-medium">
                      +{dayCards.length - 3} autres
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        {columns.map((col) => (
          <div key={col.id} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: col.color }} />
            <span className="text-xs text-gray-600 dark:text-gray-400">{col.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
