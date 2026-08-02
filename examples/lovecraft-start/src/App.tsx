import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@base-ui/react/button";
import { useUnit } from "effector-react";
import { ShellSheet } from "@shell-sheet/react";
import type { DemoSnapPoint, DemoState } from "./model.js";
import {
  locationById,
  locations,
  type AtlasLocation,
  type LocationId,
} from "./locations.js";
import { useLovecraftRuntime } from "./runtime-context.js";
import styles from "./app.module.css";

export type PrototypeVariant = "field-notes" | "cartographic" | "nocturne";

export const prototypeVariants: readonly Readonly<{
  id: PrototypeVariant;
  label: string;
}>[] = [
  { id: "field-notes", label: "Field notes" },
  { id: "cartographic", label: "Cartographic" },
  { id: "nocturne", label: "Nocturne" },
];

type AppProps = Readonly<{
  variant: PrototypeVariant;
  replay: number;
  onVariantChange(variant: PrototypeVariant): void;
  onReplay(): void;
}>;

function Arrow({ direction = "right" }: Readonly<{ direction?: "left" | "right" }>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={styles.icon} data-direction={direction}>
      <path d="M3.5 10h12M11 5.5l4.5 4.5-4.5 4.5" />
    </svg>
  );
}

function Door() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={styles.icon}>
      <path d="M5.5 17V3.5h9V17M3.5 17h13M11.5 10h.01" />
    </svg>
  );
}

function LocationCard({
  location,
  onInspect,
  onEnter,
}: Readonly<{
  location: AtlasLocation;
  onInspect(id: LocationId): void;
  onEnter(id: LocationId): void;
}>) {
  return (
    <article className={styles.card} style={{ "--location-image": `url(${location.image})` } as React.CSSProperties}>
      <Button
        className={styles.cardMain}
        onClick={() => onInspect(location.id)}
        aria-label={`Открыть краткую запись: ${location.title}`}
      >
        <span className={styles.cardSignal} aria-hidden="true" />
        <span className={styles.cardIndex}>{location.index}</span>
        <span className={styles.cardCopy}>
          <span className={styles.cardRegion}>{location.region}</span>
          <strong>{location.title}</strong>
          <span>{location.coordinates}</span>
        </span>
      </Button>
      <Button className={styles.cardEntrance} onClick={() => onEnter(location.id)}>
        <Door />
        {location.entranceLabel}
      </Button>
    </article>
  );
}

function PrototypePicker({
  value,
  onChange,
  onReplay,
}: Readonly<{
  value: PrototypeVariant;
  onChange(value: PrototypeVariant): void;
  onReplay(): void;
}>) {
  return (
    <nav className={styles.picker} aria-label="Prototype variants">
      {prototypeVariants.map((variant) => (
        <Button
          key={variant.id}
          className={styles.pickerItem}
          data-active={value === variant.id ? "" : undefined}
          aria-current={value === variant.id ? "page" : undefined}
          onClick={() => onChange(variant.id)}
        >
          {variant.label}
        </Button>
      ))}
      <span className={styles.pickerDivider} aria-hidden="true" />
      <Button className={styles.pickerReplay} aria-label="Повторить вступление (R)" onClick={onReplay}>
        ↻
      </Button>
    </nav>
  );
}

function PresentationControl({
  value,
  onChange,
}: Readonly<{
  value: "sheet" | "dialog";
  onChange(value: "sheet" | "dialog"): void;
}>) {
  return (
    <div className={styles.presentationControl} aria-label="Форма Shell Sheet">
      <span>Форма</span>
      <div>
        <Button
          data-active={value === "sheet" ? "" : undefined}
          aria-pressed={value === "sheet"}
          onClick={() => onChange("sheet")}
        >
          Sheet
        </Button>
        <Button
          data-active={value === "dialog" ? "" : undefined}
          aria-pressed={value === "dialog"}
          onClick={() => onChange("dialog")}
        >
          Dialog
        </Button>
      </div>
    </div>
  );
}

function StateHeader({ state }: Readonly<{ state: DemoState }>) {
  if (state.kind === "closed") return null;
  if (state.kind === "location.info") {
    const location = locationById[state.uiContext.locationId];
    return (
      <div className={styles.sheetHeading}>
        <span>{location.region}</span>
        <ShellSheet.Title>{location.title}</ShellSheet.Title>
        <small>{location.coordinates}</small>
      </div>
    );
  }
  if (state.kind.startsWith("arkham.")) {
    return (
      <div className={styles.sheetHeading}>
        <span>Мискатоникский архив · восточное крыло</span>
        <ShellSheet.Title>Архив Аркхэма</ShellSheet.Title>
      </div>
    );
  }
  const locationId: LocationId =
    state.kind === "innsmouth"
      ? "innsmouth"
      : state.kind === "dunwich"
        ? "dunwich"
        : state.kind === "antarctica"
          ? "antarctica"
          : "dreamlands";
  const location = locationById[locationId];
  if (state.kind === "antarctica") {
    return (
      <div className={styles.mediaHeading} style={{ backgroundImage: `url(${location.image})` }}>
        <span>{location.region}</span>
        <ShellSheet.Title>{location.title}</ShellSheet.Title>
      </div>
    );
  }
  return (
    <div className={styles.sheetHeading}>
      <span>{location.region}</span>
      <ShellSheet.Title>{location.title}</ShellSheet.Title>
      <small>{location.coordinates}</small>
    </div>
  );
}

function LongReport() {
  const location = locationById.dunwich;
  return (
    <article className={styles.longReport}>
      <img src={location.image} alt="Заброшенная ферма в Данвиче" />
      <p className={styles.lede}>{location.summary}</p>
      <section>
        <h3>Наблюдение I — геометрия</h3>
        <p>
          Через двадцать семь ступеней стены перестают сходиться в прямых углах. Фонарь
          освещает их равномерно, однако тень помощника падает в противоположную сторону.
          Сделанные мелом отметки через час оказались впереди группы.
        </p>
      </section>
      <section>
        <h3>Наблюдение II — акустика</h3>
        <p>
          Звук сверху приходит с задержкой в четыре секунды. Звук снизу — до того, как он
          произведён. Проверку остановили, когда эхо назвало отсутствующего участника.
        </p>
      </section>
      <blockquote>
        Не измеряйте глубину верёвкой. Катушка вернулась сухой, тёплой и на шесть метров
        длиннее.
      </blockquote>
      <section>
        <h3>Наблюдение III — предел</h3>
        <p>
          На уровне, который барометр считает поверхностью моря, начинается зал. Потолка
          не видно. В центре стоит каменная модель холмов, но Данвич обозначен пустотой.
        </p>
      </section>
      <ul>{location.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
    </article>
  );
}

function StateBody({ state }: Readonly<{ state: DemoState }>) {
  switch (state.kind) {
    case "closed":
      return null;
    case "location.info": {
      const location = locationById[state.uiContext.locationId];
      return (
        <div className={styles.bodyCopy}>
          <ShellSheet.Description className={styles.lede}>{location.summary}</ShellSheet.Description>
          <blockquote>{location.facts[0]}</blockquote>
        </div>
      );
    }
    case "arkham.a":
      return (
        <div className={styles.bodyCopy}>
          <p className={styles.step}>A · Приёмная архива</p>
          <ShellSheet.Description className={styles.lede}>
            В журнале выдачи обнаружен ключ без номера. Смотритель предлагает сверить его
            с каталогом восточного крыла до последнего удара часов.
          </ShellSheet.Description>
          <blockquote>Аркхэм открывается ровно по высоте этого контента и не имеет Handle.</blockquote>
        </div>
      );
    case "arkham.b":
      return (
        <div className={styles.bodyCopy}>
          <p className={styles.step}>B · Стол картографа · {state.uiContext.snapPoint}</p>
          <p className={styles.lede}>
            Три совпадающие отметки связывают лестницу архива, причал Иннсмута и пустое
            место на плане Данвича.
          </p>
          <div className={styles.evidenceGrid}>
            {Array.from({ length: state.uiContext.evidenceCount }, (_, index) => (
              <article key={index}><span>0{index + 1}</span><strong>Лист {31 + index * 8}</strong></article>
            ))}
          </div>
          {state.uiContext.snapPoint === "expanded" ? (
            <p>Полная высота показывает пометки на обороте: записи сделаны одной рукой.</p>
          ) : null}
        </div>
      );
    case "arkham.c.loading":
      return (
        <div className={styles.loadingState} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <p className={styles.step}>C.loading · запрос {state.uiContext.token}</p>
          <p className={styles.lede}>Сверяем закрытую опись. Назад отменит транспорт физически.</p>
        </div>
      );
    case "arkham.c.fail":
      return (
        <div className={styles.bodyCopy} role="alert">
          <p className={styles.step}>C.1.fail</p>
          <p className={styles.lede}>{state.uiContext.message}</p>
          <blockquote>Retry создаст новый token; результат старой операции не принимается.</blockquote>
        </div>
      );
    case "arkham.c.success":
      return (
        <div className={styles.bodyCopy}>
          <p className={styles.step}>C.1.success</p>
          <h3>{state.uiContext.report.title}</h3>
          <ol>{state.uiContext.report.entries.map((entry) => <li key={entry}>{entry}</li>)}</ol>
        </div>
      );
    case "innsmouth": {
      const expanded = state.uiContext.snapPoint === "expanded";
      return (
        <div className={styles.bodyCopy}>
          <p className={styles.step}>Причал · {expanded ? "полевая запись" : "быстрый осмотр"}</p>
          <p className={styles.lede}>{locationById.innsmouth.summary}</p>
          {expanded ? (
            <>
              {locationById.innsmouth.facts.map((fact) => <p key={fact}>{fact}</p>)}
              <img className={styles.inlineImage} src={locationById.innsmouth.image} alt="Причал Иннсмута" />
            </>
          ) : <p className={styles.hint}>Потяните Handle вверх, чтобы открыть полную запись.</p>}
        </div>
      );
    }
    case "dunwich":
      return <LongReport />;
    case "antarctica":
      return (
        <div className={styles.bodyCopy}>
          <p className={styles.lede}>{locationById.antarctica.summary}</p>
          {state.uiContext.snapPoint === "expanded"
            ? locationById.antarctica.facts.map((fact) => <p key={fact}>{fact}</p>)
            : <p className={styles.hint}>Фотография прибита к верхней кромке, Handle лежит поверх.</p>}
        </div>
      );
    case "dreamlands": {
      const expanded = state.uiContext.snapPoint === "expanded";
      return expanded ? (
        <div className={styles.dreamMap}>
          <p className={styles.step}>Пространство полной высоты</p>
          <h3>Три площадки Кадата</h3>
          {locationById.dreamlands.facts.map((fact, index) => (
            <article key={fact}><span>0{index + 1}</span><p>{fact}</p></article>
          ))}
        </div>
      ) : (
        <div className={styles.bodyCopy}>
          <p className={styles.step}>Компактный ориентир</p>
          <p className={styles.lede}>Выше первой площадки карта становится другой.</p>
          <p className={styles.hint}>Потяните Handle: здесь сменится не только высота, но и контент.</p>
        </div>
      );
    }
  }
}

function Action({ children, primary = false, onClick, disabled = false }: Readonly<{
  children: ReactNode;
  primary?: boolean;
  onClick(): void;
  disabled?: boolean;
}>) {
  return (
    <Button className={primary ? styles.primaryAction : styles.secondaryAction} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

function StateFooter({
  state,
  onClose,
  onEnter,
  onNext,
  onBack,
  onArchive,
  onSnap,
}: Readonly<{
  state: DemoState;
  onClose(): void;
  onEnter(id: LocationId): void;
  onNext(): void;
  onBack(): void;
  onArchive(result: "success" | "fail"): void;
  onSnap(snapPoint: DemoSnapPoint): void;
}>) {
  if (state.kind === "closed") return null;
  if (state.kind === "location.info") {
    return (
      <div className={styles.footerActions}>
        <Action onClick={onClose}>Закрыть</Action>
        <Action primary onClick={() => onEnter(state.uiContext.locationId)}>
          {locationById[state.uiContext.locationId].entranceLabel}<Arrow />
        </Action>
      </div>
    );
  }
  switch (state.kind) {
    case "arkham.a":
      return <div className={styles.footerActions}><Action onClick={onClose}>Выйти</Action><Action primary onClick={onNext}>К столу картографа<Arrow /></Action></div>;
    case "arkham.b":
      return (
        <div className={styles.footerStack}>
          <div className={styles.snapActions}>
            <Action onClick={() => onSnap("content")}>B.1 · компактно</Action>
            <Action onClick={() => onSnap("expanded")}>B.2 · полностью</Action>
          </div>
          <div className={styles.footerActions}><Action onClick={onBack}><Arrow direction="left" />Назад</Action><Action primary onClick={() => onArchive("fail")}>Проверить опись<Arrow /></Action></div>
        </div>
      );
    case "arkham.c.loading":
      return <div className={styles.footerActions}><Action onClick={onBack}><Arrow direction="left" />Назад и отменить</Action><Action primary disabled onClick={() => undefined}>Запрос выполняется</Action></div>;
    case "arkham.c.fail":
      return <div className={styles.footerActions}><Action onClick={onBack}><Arrow direction="left" />К уликам</Action><Action primary onClick={() => onArchive("success")}>Повторить<Arrow /></Action></div>;
    case "arkham.c.success":
      return <div className={styles.footerActions}><Action onClick={onBack}><Arrow direction="left" />К уликам</Action><Action primary onClick={onClose}>Закрыть архив</Action></div>;
    case "innsmouth":
    case "antarctica":
    case "dreamlands": {
      const expanded = state.uiContext.snapPoint === "expanded";
      return <div className={styles.footerActions}><Action onClick={onClose}>Закрыть</Action><Action primary onClick={() => onSnap(expanded ? (state.kind === "antarctica" ? "content" : "peek") : "expanded")}>{expanded ? "Свернуть" : "Открыть полностью"}<Arrow /></Action></div>;
    }
    case "dunwich":
      return <div className={styles.footerActions}><Action onClick={onClose}>Закрыть отчёт</Action><Action primary onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>К началу</Action></div>;
  }
}

function ShellSingleton({ state }: Readonly<{ state: DemoState }>) {
  const runtime = useLovecraftRuntime();
  const actions = useUnit({
    close: runtime.model.exitRequested,
    enter: runtime.model.entranceOpened,
    next: runtime.model.nextRequested,
    back: runtime.model.backRequested,
    archive: runtime.model.archiveRequested,
    snap: runtime.model.snapRequested,
  });
  return (
    <ShellSheet.Root
      controller={runtime.controller}
      animation={runtime.animation}
      closeOnBackdrop
      closeOnEscape
    >
      <ShellSheet.Portal keepMounted className={styles.portal}>
        <ShellSheet.Backdrop className={styles.backdrop} />
        <ShellSheet.Viewport className={styles.viewport}>
          <ShellSheet.Popup className={styles.popup}>
            <ShellSheet.Content className={styles.sheetContent}>
              <ShellSheet.Header className={`${styles.sheetHeader} ${state.kind === "antarctica" ? styles.sheetHeaderMedia : ""}`}>
                <ShellSheet.Handle className={styles.handle}><span /></ShellSheet.Handle>
                <StateHeader state={state} />
              </ShellSheet.Header>
              <ShellSheet.Body className={styles.sheetBody}>
                <StateBody state={state} />
              </ShellSheet.Body>
              <ShellSheet.Footer className={styles.sheetFooter}>
                <StateFooter
                  state={state}
                  onClose={() => actions.close()}
                  onEnter={actions.enter}
                  onNext={() => actions.next()}
                  onBack={() => actions.back()}
                  onArchive={actions.archive}
                  onSnap={(snapPoint) => actions.snap({ snapPoint })}
                />
              </ShellSheet.Footer>
            </ShellSheet.Content>
          </ShellSheet.Popup>
        </ShellSheet.Viewport>
      </ShellSheet.Portal>
    </ShellSheet.Root>
  );
}

export function App({ variant, replay, onVariantChange, onReplay }: AppProps) {
  const runtime = useLovecraftRuntime();
  const { state, select, enter, presentation, responsive } = useUnit({
    state: runtime.model.$state,
    select: runtime.model.locationSelected,
    enter: runtime.model.entranceOpened,
    presentation: runtime.model.presentationChanged,
    responsive: runtime.model.responsivePresentationResolved,
  });
  const initialResponsive = useRef(true);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const update = (): void => {
      responsive({ mobile: query.matches, initial: initialResponsive.current });
      initialResponsive.current = false;
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [responsive]);

  return (
    <div className={styles.app} data-variant={variant} data-replay={replay}>
      <PrototypePicker value={variant} onChange={onVariantChange} onReplay={onReplay} />
      <header className={styles.siteHeader}>
        <div className={styles.monogram}>A</div>
        <div><span>Мискатоникский архив</span><strong>Полевой атлас</strong></div>
        <PresentationControl value={state.presentation} onChange={presentation} />
      </header>
      <main className={styles.scene}>
        <p className={styles.eyebrow}>Интерактивный полевой архив</p>
        <h1>Места, которых<br />не должно быть<br />на карте</h1>
        <p className={styles.intro}>
          Нажмите на локацию для краткой записи или используйте вход, чтобы проверить
          отдельный сценарий адаптивной панели.
        </p>
        <div className={styles.locations}>
          {locations.map((location) => (
            <LocationCard key={location.id} location={location} onInspect={select} onEnter={enter} />
          ))}
        </div>
      </main>
      <ShellSingleton state={state} />
    </div>
  );
}
