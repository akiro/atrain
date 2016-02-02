(function () {
    var Train = function (item, stationShortCode) {
        var self = this;

        self.timetable = $.map(item.timeTableRows, function (timeTableItem) {
            if (timeTableItem.trainStopping) return new TimeTable(timeTableItem)
        });
        self.trainNumber = item.trainNumber;
        self.commuterLineID = item.commuterLineID;
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

        self.liveEstimateTime = ko.pureComputed(function () {
            var station = self.station();
            return station == null ? null : station.getTime('liveEstimateTime');
        });

        self.actualTime = ko.pureComputed(function () {
            var station = self.station();
            return station == null ? null : station.getTime('actualTime');
        });

        self.timeDiff = ko.pureComputed(function () {
            var station = self.station();
            return station == null ? null : station.timeDiff();
        });
        
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

        this.getTime = function (time) {
            return this[time] == null ? '-' : this[time].format('HH:mm:ss');
        };

        this.timeDiff = ko.pureComputed(function () {
            if (self.actualTime != null) return self.actualTime.diff(self.scheduledTime, 'seconds');
        });

        this.cssType = ko.pureComputed(function () {
            return self.type === "DEPARTURE" ? "fa-arrow-left green" : "fa-arrow-right blue";
        });
    };

    var TrainListModel = function (params) {
        var self = this;
        self.api = 'http://rata.digitraffic.fi/api/v1/';

        self.stations = ko.observableArray([]);
        self.trains = ko.observableArray([]);
        self.startStation = ko.observable();
        self.endStation = ko.observable();

        self.search = function () {
            $.ajax({
                url: self.api + 'live-trains',
                dataType: 'json',
                data: {
                    'station': self.startStation().stationShortCode,
                    'minutes_before_departure': 90,
                    'minutes_before_arrival': 0,
                    'minutes_after_departure': 15,
                    'minutes_after_arrival': 0
                },
                success: function (response) {
                    var mappedTrains = $.map(response, function (item) { return new Train(item, self.startStation().stationShortCode) });
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

        self.initStations = function (stationData) {
            self.stations(stationData);

            if (params['station'] != null) {
                self.startStation(self.findStation(params['station']));
                self.search();
            }
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
        // url params
        var params = {}; window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (str, key, value) { params[key] = decodeURIComponent(value); });

        ko.applyBindings(new TrainListModel(params));
    });
}());