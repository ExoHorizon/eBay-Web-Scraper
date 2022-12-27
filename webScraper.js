const PORT = 8000;
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const app = express();

// Detect changes to the code and restart accordingly.
app.listen(PORT, () => console.log(`server running on port ${PORT}`));

// Limited to 4 pages as to not violate Ebay Terms & Conditions against web scraping.
maxPage = 4;
search = '3080+evga+ftw3';
hasNext = true;

// Container for all eBay listings
const itemListings = [];

for (let i = 1; i <= maxPage; i++) {
    // Current search url with incrementing page number
    url = 'https://www.ebay.com/sch/i.html?_from=R40&_nkw=' + search + '&_sacat=0&_pgn=' + i;

    axios(url)
        .then(response => {
            //Acquiring data from webpage
            const html = response.data;
            const data = cheerio.load(html);

            // Set maxPage to the lastPageNumber on pagination
            data('.pagination__items', html).find('li > a').each(function (index, element) {
                lastPageNumber = data(element).text();
            })
            if (lastPageNumber <= maxPage) {
                maxPage = lastPageNumber;
            }

            // Scrape the necessary details for each item listing
            data('.s-item__wrapper', html).each(function () {
                const title = data(this).find('.s-item__title').text();
                const itemURL = data(this).find('.s-item__link').attr('href');
                const priceData = data(this).find('.s-item__price').text();
                const shippingData = data(this).find('.s-item__logisticsCost').text();
                const listingType = data(this).find('.s-item__detail--primary').text();

                // Remove any listings auto inserted by eBay
                if (title != 'Shop on eBay') {
                    itemListings.push(new ItemListing(title, itemURL, priceData, shippingData,
                        listingType));
                }
            });

            // Sort the item listings basedon the custom compare funcitons
            itemListings.sort(compareItemListing);

            // Output the data to the console log
            for (element of itemListings) {
                element.printOut();
            }
        });
}

/**
 * Function used to compare two ItemListing objects
 * 
 * Preconditions: listing1 instanceof ItemListing, listing 2 instaceof ItemListing
 * Postconditions: Sort by ascending order (lower the cost, the lesser) first by buyNowPrice and 
 * then by currentPrice. An ItemListing without a buyNowPrice is considered to be greater than an
 * ItemListing with a buyNowPrice. Returns a negative number if listing1 is lesser, positive 
 * number if listing 1 is greater, and 0 if both ItemListing objects have the same price.
 * 
 * @param {*} listing1 the current ItemListing
 * @param {*} listing2 the ItemListing we are comparing to
 * @returns as per postcondition
 */
function compareItemListing(listing1, listing2) {
    // Check preconditions
    if (!(listing1 instanceof ItemListing) || !(listing2 instanceof ItemListing)) {
        throw new Error('Violation of preconditions at compareItemListing(listing1, listing2): '
            + 'listing1 and listing2 must both be instaces of ItemListing.');
    }

    // If both ItemListing objects do not have a buyNowPrice, the ItemListing object with the lesser
    // currentPrice is then considered.
    if (listing1.buyNowPrice == 'N/A' && listing2.buyNowPrice == 'N/A') {
        return listing1.currentPrice - listing2.currentPrice;
    }

    // If listing1 does not have a buyNowPrice, it is considered greater than listing 2.
    if (listing1.buyNowPrice == 'N/A') {
        return 1;
    }
    // If listing2 does not have a buyNowPrice, it is considered greater than listing 1.
    else if (listing2.buyNowPrice == 'N/A') {
        return -1;
    }
    // If both ItemListing objects have a buyNowPrice, the buyNowPrice is considered.
    else {
        return listing1.buyNowPrice - listing2.buyNowPrice;
    }
}

/**
 * Container for holding the data of each eBay item listing.
 */
class ItemListing {
    constructor(title, itemURL, priceData, shippingData, listingType) {
        this.title = title;
        this.itemURL = itemURL;
        this.priceData = priceData;
        this.shippingData = shippingData;
        this.listingType = listingType;

        this.title = title.replace('New Listing', '');
        this.shippingPrice = this.getShippingPrice();
        this.currentPrice = this.getCurrentPrice();
        this.buyNowPrice = this.getBuyNowPrice();
    }

    /**
     * Calculates and returns the shipping price of this ItemListing.
     * 
     * Preconditions: this.shippingData != null
     * Postconitions: Returns 0 if this.shippingData mentions 'free shipping' and the proper price
     * as a float otherwise.
     * 
     * @returns as per postconditions
     */
    getShippingPrice() {
        // Check preconditions
        if (this.shippingData == null) {
            throw new Error('Violation of preconditions at ItemListing.getShippingPrice(): '
                + 'this.shippingData cannot be null.');
        }

        if (this.shippingData.toLowerCase() === 'free shipping') {
            // Item listed has free shipping, return 0 as shipping cost.
            return 0;
        } else {
            // Item listed does not have free shipping, get shipping price from string.
            return this.shippingData.replace(/\D/g, "") / 100;
        }
    }

    /**
     * Calculates and returns the current price of this ItemListing.
     * 
     * Preconditions: this.priceData != null, this.shippingPrice != null
     * Postconditions: Returns the current price of this ItemListing (includes bid pricing)
     * 
     * @returns as per postconditions.
     */
    getCurrentPrice() {
        // Check preconditions
        if (this.priceData == null || this.shippingData == null) {
            throw new Error('Violation of preconditions at ItemListing.getCurrentPrice(): '
                + 'this.priceData and this.shippingData cannot be null.');
        }

        // Some priceData returned by the web scraper has two values such as $100.00$200.00
        // The first value represents the current bid price while the second value represents
        // the buy now price. The variable secondValueIndex represents the start index of the 
        // second price.
        var secondValueIndex = this.priceData.indexOf('$', 1);
        var currentPrice;

        // If a second price is present, only return the first price. Otherwise, just return the 
        // price. Removes the '$' symbol.
        if (secondValueIndex != -1) {
            currentPrice = this.priceData.substring(1, secondValueIndex);
        }
        else {
            currentPrice = this.priceData.substring(1);
        }

        // Removes any ',' in the price to avoid calculation errors with converting to a float.
        currentPrice = currentPrice.replace(',', '');

        // Adds the shippingPrice 
        currentPrice = parseFloat(currentPrice) + parseFloat(this.shippingPrice);

        return currentPrice;
    }

    /**
     * Calculates and returns the buy now price of this ItemListing.
     * 
     * Preconditions: this.priceData != null, this.shippingPrice != null, this.listingType != null
     * Postconditions: Returns the buy now price of this ItemListing (excludes bid pricing) and 
     * 'N/A' if this ItemListing does not have a buy now price.
     * 
     * @returns as per postconditions.
     */
    getBuyNowPrice() {
        // Check preconditions
        if (this.priceData == null || this.shippingData == null || this.listingType == null) {
            throw new Error('Violation of preconditions at ItemListing.getBuyNowPrice(): '
                + 'this.priceData, this.shippingData, and this.listingType cannot be null.');
        }

        // Some priceData returned by the web scraper has two values such as $100.00$200.00
        // The first value represents the current bid price while the second value represents
        // the buy now price. The variable secondValueIndex represents the start index of the 
        // second price.
        var secondValueIndex = this.priceData.indexOf('$', 1);

        // If a second price is present, only return the second price. Removes the '$' symbol.
        if (secondValueIndex != -1) {
            // Has a second price
            var tempPrice = this.priceData.substring(secondValueIndex + 1);
            // Removes any ',' in the price to avoid calculation errors with converting to a float.
            tempPrice = tempPrice.replace(',', '');
            tempPrice = parseFloat(tempPrice) + parseFloat(this.shippingPrice);
            return tempPrice;
        } else {
            // The second price is not present

            // If this ItemListing is a bid, then there is no buy now price. Return 'N/A'.
            if (this.listingType.includes('bid')) {
                return 'N/A';
            } else {
                // This ItemListing is a buy now listing. Return the first price.
                var tempPrice = this.priceData.substring(1);
                // Removes any ',' in the price to avoid calculation errors with converting to a float.
                tempPrice = tempPrice.replace(',', '');
                tempPrice = parseFloat(tempPrice) + parseFloat(this.shippingPrice);
                return tempPrice;
            }
        }
    }

    /**
     * Preconditions: this.title != null, this.currentPrice != null, this.buyNowPrice != null,
     * this.itemURL != null.
     * Postconditions: Prints out the processed data of this ItemListing
     */
    printOut() {
        // Check preconditions
        if (this.title == null || this.currentPrice == null || this.buyNowPrice == null
            || this.itemURL == null) {
            throw new Error('Violation of preconditions at ItemListing.printOut(): '
                + 'this.title, this.currentPrice, this.buyNowPrice, and this.itemURL '
                + 'cannot be null.');
        }

        console.log('Title: ' + this.title);
        console.log('Current Price: $' + this.currentPrice.toFixed(2));
        if (this.buyNowPrice == 'N/A') {
            console.log('Buy Now Price: N/A');
        } else {
            console.log('Buy Now Price: $' + this.buyNowPrice.toFixed(2));
        }
        console.log(this.itemURL);
        console.log('');
    }
}