import type { Outfit, WeatherSummary } from '../supabase/functions/_shared/stylist.ts'
import type { Place } from './lib/weather'

export type { Outfit, OutfitMode, WeatherSummary } from '../supabase/functions/_shared/stylist.ts'
export type Category = 'Верх' | 'Низ' | 'Платье' | 'Верхняя одежда' | 'Обувь' | 'Аксессуар'

export type Item = {
  id: string; name: string; category: Category; color: string; season: string;
  warmth: number; createdAt: string;
  /** Устаревшее поле: фото как data URL / внешний URL (старые записи до хранилища). */
  image: string;
  /** Свой текст заметки (метки — в tags). */
  note: string;
  tags?: string[];
  /** Пути в закрытом хранилище: <user>/<item>/original.jpg и clean.jpg (белый фон). */
  photoPath?: string; originalPath?: string; useOriginal?: boolean;
  type?: string; colors?: string[]; material?: string; formality?: number; style?: string;
  heelHeight?: string; windProtection?: boolean; rainProtection?: boolean;
  /** Из обратной связи: жалобы и «беру» — влияют на следующие подборы. */
  complaints?: number; likes?: number;
  /** Карточка создана автоматически — стоит проверить поля. */
  needsReview?: boolean;
}

export type SavedOutfit = Outfit & { chosenAt: string; weatherSnapshot?: WeatherSummary }

export type EventItem = {
  id: string; title: string; date: string; start: string; end: string;
  place: string; kind: string; outside: string; walking: boolean; outfitId?: string; comment?: string;
  outfit?: SavedOutfit;
  weatherSnapshot?: WeatherSummary;
  feedbackDone?: boolean;
}

export type TripDayPlan = { date: string; weather: WeatherSummary; outfit: Outfit | null }
export type Trip = {
  id: string; city: string; from: string; to: string; kind: string; activities?: string[];
  checklist: { id: string; label: string; done: boolean }[];
  place?: Place;
  plan?: { days: TripDayPlan[]; itemIds: string[]; missing: string[]; generatedAt: string };
  /** Вещи, которые пользовательница убрала из чемодана — не предлагать в этой поездке. */
  excludedItemIds?: string[];
}

export type Measurements = { bust?: number; waist?: number; hips?: number; height?: number }
export type NotificationSettings = { events: boolean; weather: boolean; eveningTime: string; hoursBefore: number }

export type Profile = {
  city: string; styles: string[]; likedColors: string; dislikedColors: string;
  place?: Place;
  bodyType?: string; measurements?: Measurements;
  /** Заготовка на будущее (не входит в ядро). */
  colorType?: string;
  notifications?: NotificationSettings;
  onboarded?: boolean;
  dismissedAdvice?: string[];
}

export type Feedback = {
  id: string; eventId?: string; outfitId: string; itemIds: string[]; createdAt: string;
  action?: 'take' | 'other'; mode?: string;
  comfortable?: boolean; problems?: string[]; liked?: boolean;
}
