"use client";

import { useState } from "react";
import {
  CUSTOM_LOCATION_VALUE,
  cityOptions,
  countryLabel,
  countryOptions,
  resolveCitySelection,
  resolveCountrySelection,
  type FocusCountryCode,
} from "@/lib/country";
import { useLocale, useMessages } from "@/lib/i18n/context";

const DEFAULT_INPUT =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

type Props = {
  defaultCountry?: string | null;
  defaultCity?: string | null;
  countryName?: string;
  cityName?: string;
  /** Show field labels above each control (profile editors). */
  showLabels?: boolean;
  countryLabelText?: string;
  cityLabelText?: string;
  className?: string;
  inputClassName?: string;
  /** Wrap each field for grid layouts that expect labeled blocks. */
  fieldClassName?: string;
};

export function CountryCityFields({
  defaultCountry = null,
  defaultCity = null,
  countryName = "country",
  cityName = "city",
  showLabels = false,
  countryLabelText,
  cityLabelText,
  className,
  inputClassName = DEFAULT_INPUT,
  fieldClassName,
}: Props) {
  const locale = useLocale();
  const m = useMessages();
  const loc = locale === "zh" ? "zh" : "en";

  const initialCountry = resolveCountrySelection(defaultCountry);
  const initialCity = resolveCitySelection(
    defaultCity,
    initialCountry.code === CUSTOM_LOCATION_VALUE
      ? CUSTOM_LOCATION_VALUE
      : (initialCountry.code as FocusCountryCode | ""),
    loc,
  );

  const [countryCode, setCountryCode] = useState(initialCountry.code);
  const [customCountry, setCustomCountry] = useState(initialCountry.custom);
  const [cityValue, setCityValue] = useState(initialCity.value);
  const [customCity, setCustomCity] = useState(initialCity.custom);

  const countries = countryOptions(loc);
  const cities =
    countryCode && countryCode !== CUSTOM_LOCATION_VALUE
      ? cityOptions(countryCode as FocusCountryCode, loc)
      : [];

  const submittedCountry =
    countryCode === CUSTOM_LOCATION_VALUE
      ? customCountry.trim()
      : countryCode
        ? countryLabel(countryCode, loc)
        : "";

  const submittedCity =
    cityValue === CUSTOM_LOCATION_VALUE ? customCity.trim() : cityValue;

  const onCountryChange = (next: typeof countryCode | string) => {
    const code = next as typeof countryCode;
    setCountryCode(code);
    setCityValue("");
    setCustomCity("");
    if (code !== CUSTOM_LOCATION_VALUE) setCustomCountry("");
  };

  const countryField = (
    <div className="space-y-1">
      {showLabels && (
        <span className="text-xs text-slate-500">{countryLabelText ?? m.profileEditor.country}</span>
      )}
      <select
        value={countryCode}
        onChange={(e) => onCountryChange(e.target.value)}
        className={inputClassName}
        aria-label={countryLabelText ?? m.profileEditor.country}
      >
        <option value="">{m.common.select}</option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
        <option value={CUSTOM_LOCATION_VALUE}>{m.common.custom}</option>
      </select>
      {countryCode === CUSTOM_LOCATION_VALUE && (
        <input
          value={customCountry}
          onChange={(e) => setCustomCountry(e.target.value)}
          placeholder={m.customers.countryPlaceholder}
          className={inputClassName}
        />
      )}
      <input type="hidden" name={countryName} value={submittedCountry} />
    </div>
  );

  const cityField = (
    <div className="space-y-1">
      {showLabels && (
        <span className="text-xs text-slate-500">{cityLabelText ?? m.profileEditor.city}</span>
      )}
      {!countryCode || countryCode === CUSTOM_LOCATION_VALUE ? (
        <input
          value={customCity}
          onChange={(e) => {
            setCityValue(CUSTOM_LOCATION_VALUE);
            setCustomCity(e.target.value);
          }}
          placeholder={m.customers.cityPlaceholder}
          className={inputClassName}
          disabled={!countryCode}
        />
      ) : (
        <>
          <select
            value={cityValue}
            onChange={(e) => {
              const next = e.target.value;
              setCityValue(next);
              if (next !== CUSTOM_LOCATION_VALUE) setCustomCity("");
            }}
            className={inputClassName}
            aria-label={cityLabelText ?? m.profileEditor.city}
          >
            <option value="">{m.common.select}</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={CUSTOM_LOCATION_VALUE}>{m.common.custom}</option>
          </select>
          {cityValue === CUSTOM_LOCATION_VALUE && (
            <input
              value={customCity}
              onChange={(e) => setCustomCity(e.target.value)}
              placeholder={m.customers.cityPlaceholder}
              className={inputClassName}
            />
          )}
        </>
      )}
      <input type="hidden" name={cityName} value={submittedCity} />
    </div>
  );

  if (fieldClassName) {
    return (
      <>
        <label className={fieldClassName}>{countryField}</label>
        <label className={fieldClassName}>{cityField}</label>
      </>
    );
  }

  return (
    <div className={className ?? "flex gap-2"}>
      <div className="flex-1 min-w-0">{countryField}</div>
      <div className="flex-1 min-w-0">{cityField}</div>
    </div>
  );
}
