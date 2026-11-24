package com.dukaanhq.app.ui

import com.google.i18n.phonenumbers.PhoneNumberUtil
import java.util.Locale

data class Country(val region: String, val name: String, val callingCode: Int) {
    val flag: String
        get() =
            region
                .uppercase(Locale.ROOT)
                .map { String(Character.toChars(0x1F1E6 + it.code - 'A'.code)) }
                .joinToString("")
}

object PhoneNumbers {
    private val utility = PhoneNumberUtil.getInstance()
    val countries: List<Country> by lazy {
        utility.supportedRegions
            .map { Country(it, Locale("", it).displayCountry, utility.getCountryCodeForRegion(it)) }
            .sortedWith(compareBy<Country> { it.region != "IN" }.thenBy { it.name })
    }

    fun country(region: String) =
        countries.firstOrNull { it.region == region } ?: countries.first { it.region == "IN" }

    fun digits(value: String, region: String): String {
        if (value.trim().startsWith("+")) {
            runCatching { utility.parse(value, region) }
                .getOrNull()
                ?.let {
                    if (utility.getRegionCodeForNumber(it) == region)
                        return utility.getNationalSignificantNumber(it).take(15)
                }
        }
        return value.filter { it in '0'..'9' }.take(if (region == "IN") 10 else 15)
    }

    fun international(digits: String, region: String): String? = runCatching {
        val number = utility.parse(digits, region)
        if (!utility.isValidNumberForRegion(number, region)) null
        else utility.format(number, PhoneNumberUtil.PhoneNumberFormat.E164)
    }
        .getOrNull()

    fun display(e164: String): String = runCatching {
        utility.format(utility.parse(e164, null), PhoneNumberUtil.PhoneNumberFormat.INTERNATIONAL)
    }
        .getOrDefault(e164)
}
