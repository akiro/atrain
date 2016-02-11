(function () {
    var Train = function (item, stationShortCode) {
        var self = this;

        self.timetable = $.map(item.timeTableRows, function (timeTableItem) {
            if (timeTableItem.trainStopping) return new TimeTable(timeTableItem)
        });
        self.trainNumber = item.trainNumber;
        self.commuterLineID = item.commuterLineID;
        self.cancelled = item.cancelled;

        self.stationShortCode = stationShortCode;
        self.showDetails = ko.observable(false);

        self.destination = ko.pureComputed(function () {
            return self.timetable[self.timetable.length-1];
        });

        self.toggleDetails = function () {
            self.showDetails(!self.showDetails());
        };

        self.station = function () {
            var timetableRow = ko.utils.arrayFirst(self.timetable, function (item) {
                return item.stationShortCode == self.stationShortCode
                    && item.type == "DEPARTURE";
            });

            return timetableRow;
        };

        self.scheduledTime = ko.pureComputed(function () {
            var station = self.station();
            return station==null?null:station.getTime('scheduledTime');
        });

        self.actualTime = ko.pureComputed(function () {
            var station = self.station();

            if(station != null) {
                var actual = station.getTime('actualTime');
                return actual == null? station.getTime('liveEstimateTime') : actual;
            }

            return null;
        });

        self.timeDiff = ko.pureComputed(function () {
            var station = self.station();
            return station == null ? null : station.timeDiff();
        });
        
        self.platform = ko.pureComputed(function () {
            var station = self.station();
            return station == null ? null : station.commercialTrack;
        })
    };

    var Station = function (item) {
        this.type = item.type;
        this.stationName = item.stationName;
        this.stationShortCode = item.stationShortCode;
        this.stationUICCode = item.stationUICCode;
    };

    var TimeTable = function (item) {
        var self = this;
        this.type = item.type;
        this.stationShortCode = item.stationShortCode;
        this.scheduledTime = item.scheduledTime?moment(item.scheduledTime):null;
        this.actualTime = item.actualTime ? moment(item.actualTime) : null;
        this.liveEstimateTime = item.liveEstimateTime ? moment(item.liveEstimateTime) : null;
        this.commercialTrack = item.commercialTrack;

        this.getTime = function (time) {
            return self[time] == null ? null : self[time].format('HH:mm:ss');
        };

        this.timeDiff = ko.pureComputed(function () {
            if (self.actualTime != null) return moment.duration(self.actualTime.diff(self.scheduledTime));
            else if (self.liveEstimateTime != null) return moment.duration(self.liveEstimateTime.diff(self.scheduledTime));
            else return moment.duration(0);
        });

        this.cssType = ko.pureComputed(function () {
            return self.type === "DEPARTURE" ? "fa-arrow-left green" : "fa-arrow-right blue";
        });

        self.actualTimeTxt = ko.pureComputed(function () {
            var actual = self.getTime('actualTime');
            return actual == null ? self.getTime('liveEstimateTime') : actual;
        });
    };

    var TrainListModel = function (params) {
        var self = this;
        self.api = 'http://rata.digitraffic.fi/api/v1/';

        self.stations = ko.observableArray([]);
        self.trains = ko.observableArray([]);
        self.startStation = ko.observable();
        self.endStation = ko.observable();
        self.showSearch = ko.observable(true);

        self.search = function () {
            $.ajax({
                url: self.api + 'live-trains',
                dataType: 'json',
                data: {
                    'station': self.startStation().stationShortCode,
                    'minutes_before_departure': 120,
                    'minutes_before_arrival': 0,
                    'minutes_after_departure': 15,
                    'minutes_after_arrival': 0
                },
                success: function (response) {
                    var mappedTrains = $.map(response, function (item) {return new Train(item, self.startStation().stationShortCode)});

                    if (self.endStation() != null) {
                        mappedTrains = ko.utils.arrayFilter(mappedTrains, function (item) {
                            var foundItem = ko.utils.arrayFirst(item.timetable, function (timeItem) {
                                return timeItem.type == "ARRIVAL" && timeItem.stationShortCode == self.endStation().stationShortCode
                            });

                            return foundItem != null;
                        });
                    }

                    var mappedSortedTrains = mappedTrains.sort(function (left, right) {
                        var lTime = left.station() == null ? null : left.station().scheduledTime;
                        var rTime = right.station() == null ? null : right.station().scheduledTime;
                        return lTime == rTime?0:(lTime<rTime?-1:1);
                    });
                    self.trains(mappedSortedTrains);
                }
            });
        };

        self.findStation = function(stationShortCode) {
            return ko.utils.arrayFirst(self.stations(), function (item) {
                return item.stationShortCode == stationShortCode;
            });
        };

        self.stationName = function (stationShortCode) {
            return ko.pureComputed(function () {
                var station = self.findStation(stationShortCode);
                return station == null ? stationShortCode : station.stationName.replace(' asema','');
            });
        };

        self.fromName = ko.pureComputed(function () {
            var station = self.startStation();
            return station == null ? null : self.stationName(station.stationShortCode);
        });

        self.toName = ko.pureComputed(function () {
            var station = self.endStation();
            return station == null ? null : self.stationName(station.stationShortCode);
        });

        self.toggleSearch = function () {
            self.showSearch(!self.showSearch());
        };

        self.initStations = function (stationData) {
            self.stations(stationData);

            // if we get params perform initial search with those stations
            if (params['from'] != null) {
                var start = self.findStation(params['from'])
                var end = null;
                if (params['to'] != null) end = self.findStation(params['to']);

                if (start != null && start != end) {
                    self.startStation(start);
                    if (params['to'] != null) self.endStation(end);
                    self.showSearch(false);
                    self.search();
                } else alert("Invalid parameters");
            }

            // refresh once every 2min (server sets max-age 120)
            setInterval(function () {
                if (self.startStation() != null) self.search();
            }, 121 * 1000);
        };

        // load initial data, cached in localStorage if possible
        var storageStations = localStorage.getItem('stations');
        if (!storageStations) {
            $.ajax({
                url: self.api + 'metadata/stations',
                dataType: 'json',
                success: function (response) {
                    var mappedStations = $.map(response, function (item) {
                        if (item.passengerTraffic) return new Station(item)
                    });
                    localStorage.setItem('stations', JSON.stringify(mappedStations));
                    self.initStations(mappedStations);
                }
            });
        } else {
            self.initStations(JSON.parse(storageStations));
        }
    };

    $(document).ready(function () {
        // GET params
        var params = {}; window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (str, key, value) { params[key] = decodeURIComponent(value); });

        ko.applyBindings(new TrainListModel(params));
    });
}());