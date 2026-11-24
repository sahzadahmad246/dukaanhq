package com.dukaanhq.app

import com.dukaanhq.app.ui.PhoneNumbers
import com.google.i18n.phonenumbers.PhoneNumberUtil
import org.junit.Assert.*
import org.junit.Test

class PhoneNumbersTest {
    @Test
    fun `India is default, includes calling code and caps national input to ten digits`() {
        assertEquals("IN", PhoneNumbers.countries.first().region)
        assertEquals(91, PhoneNumbers.country("IN").callingCode)
        assertEquals("9876543210", PhoneNumbers.digits("987654321099999", "IN"))
        assertEquals("9876543210", PhoneNumbers.digits("+91 98765 43210", "IN"))
        assertEquals("+919876543210", PhoneNumbers.international("9876543210", "IN"))
        assertNull(PhoneNumbers.international("12345", "IN"))
        assertNull(PhoneNumbers.international("0000000000", "IN"))
    }

    @Test
    fun `country picker covers supported regions and validates their national number lengths`() {
        assertTrue(PhoneNumbers.countries.size > 200)
        val utility = PhoneNumberUtil.getInstance()
        for (region in listOf("US", "GB", "AE", "BD")) {
            val example =
                utility.getExampleNumberForType(region, PhoneNumberUtil.PhoneNumberType.MOBILE)
            val digits = utility.getNationalSignificantNumber(example)
            assertEquals(
                utility.format(example, PhoneNumberUtil.PhoneNumberFormat.E164),
                PhoneNumbers.international(digits, region),
            )
            assertNull(PhoneNumbers.international("1", region))
        }
    }
}
