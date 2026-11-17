# Проект: ИИ-стилист MUSE (ядро MVP)

## Что это
PWA для девушек: загружают фото своей одежды (минимум 10 вещей), указывают событие, место и время —
приложение с учётом почасовой погоды предлагает 3–4 образа из их вещей. Есть календарь событий
с образами и уведомления, а также «чемодан» — список вещей и образы по дням для поездки.
Интерфейс на русском, mobile-first.

## Принципы
- Быстро: минимум шагов и полей. Карточка вещи правится касаниями (chips), не вводом текста.
- Удобно: учитывать погоду на весь интервал события и заметки к вещам («натирает» и т.п.).
  Не предлагать заведомо неудобное без предупреждения («цена образа»).
- Приватность: фото в закрытом бакете, доступ по временным ссылкам, всё удаляется по запросу.
- Тип фигуры — только для подбора силуэтов. Никаких оценок тела и советов «исправить» внешность.

## Стек и решения
- Фронтенд: Vite + React 18 + TypeScript, vite-plugin-pwa (manifest + service worker, push-handler.js).
- Бэкенд: Supabase (Postgres + RLS, Auth, Storage, Edge Functions на Deno).
  Размещение данных в РФ — вопрос к юристу (Павел); Supabase можно заменить на self-hosted Supabase в Yandex Cloud.
- Погода: Open-Meteo. Модель не фиксируем (best_match), прогноз 16 дней почасово, ветер в м/с,
  координаты города храним в профиле. Для поездок дальше 16 дней — климат (архив Open-Meteo, среднее за 3 года).
  Кеш 30 мин в памяти + localStorage. Перед коммерческим запуском проверить условия Open-Meteo (платный тариф для коммерции).
- Свой ИИ (по умолчанию, без внешних сервисов):
  - распознавание вещи на устройстве — CLIP (`Xenova/clip-vit-base-patch16`, ONNX q8, transformers.js):
    тип/категория/материал/каблук по сходству с описаниями (`src/lib/vision/catalog.ts`), цвета — по пикселям,
    теплота/сезон/формальность/стиль/защита — из справочника по типу. Модель ~90 МБ, кешируется браузером;
    `VITE_MODEL_HOST` — свой хост модели (например, Yandex Object Storage), `VITE_CLIP_MODEL` — другая модель.
  - подбор образов — движок правил + обучение на реакциях (`src/lib/learning.ts`: вещи, пары, цвета;
    полураспад 45 дней), вклад до ±1 балла «красоты».
- Внешний ИИ (необязательно): `VITE_RECOGNITION=server`, `VITE_OUTFIT_AI=server` — Edge Functions с
  OpenAI-совместимым API (`OPENAI_BASE_URL`). Подбор передаёт только атрибуты вещей, без фото.
- Удаление фона: по умолчанию в браузере (`@imgly/background-removal`, модель isnet_fp16, фото не покидает устройство).
  ⚠ Лицензия AGPL-3.0 — для коммерции купить лицензию IMG.LY или задать `VITE_BG_REMOVAL_URL` (свой сервер rembg).
- Движок подбора: `supabase/functions/_shared/stylist.ts` — чистый TS, общий для фронта и Edge Functions.
  Правила (шаг 4 ТЗ) проверяются поверх ответа ИИ; без ИИ работает подбор по правилам.
- Уведомления: Web Push (VAPID) + Edge Function `send-reminders` по pg_cron каждые 15 мин.
  На iPhone — только PWA на главном экране. Плюс в приложении: баннер «погода изменилась».
- Тесты: Vitest (`npm test`) — движок подбора, погода, тип фигуры.

## Структура данных
Документы пользователя — JSONB в колонке `data` (новые поля без миграций):
- `profiles(user_id, data)` — Profile: city, place{lat,lon,timezone}, styles[], likedColors, dislikedColors,
  bodyType, measurements, colorType (на будущее), notifications, onboarded, dismissedAdvice[].
- `wardrobe_items(user_id, id, data)` — Item: category, type, colors[], season, warmth 1–5, material, formality 1–5,
  style, heelHeight, windProtection, rainProtection, tags[] (метки комфорта), note, photoPath/originalPath/useOriginal,
  complaints, likes, needsReview.
- `events(user_id, id, data)` — EventItem + outfit (SavedOutfit с weatherSnapshot), feedbackDone.
- `trips(user_id, id, data)` — Trip + place, plan{days[{date, weather, outfit}], itemIds, missing}, checklist, excludedItemIds.
- `feedback(user_id, id, data)` — «беру/другой», режим, было удобно, что мешало, понравился.
- `analytics_events`, `ai_usage`, `ai_cache`, `push_subscriptions`, `notifications_sent`.
- Storage: бакет `wardrobe` (private), путь `<user_id>/<item_id>/{original,clean}.jpg`.
- Views для Павла: `analytics_summary`, `ai_cost_daily`.
Миграция: `supabase/migrations/20261112000000_core.sql` (идемпотентна).

## Не делать в ядре
Лента магазинов, цветотип, кожа/макияж, оплата. Тип фигуры добавлен по запросу заказчика как необязательный.
