//Function to use a collection of assets and a stream of staff movements to handle a stream of patients
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    var Sim = require ("./sim-0.26.js").Sim;
    var Random = require("./sim-0.26.js").Random;

    // Import a configuration script which defines how to generate realistic cases
    var caseConfig = require("./case.js");
    // Import a configuration script which defines the resources and staff available
    var serviceConfig = require('./service.js');

    // Import a tool which generates a sequence of cases
    var caseGen = require("./genCases.js");

    // Import a tools which generates staff movements on and off shift
    var movGen = require("./genMovements.js");
}
// Create a case generator by providing the configuration details
// Get next case cases.next().value;
var cases = new caseGen(caseConfig);

// Create a set of staff movement generators by providing the service details
// Get next shift change staffing.next().value;
var staffing = new movGen(serviceConfig);

const Simtime = 7 * 24 * 60; // Duration of simulation in minutes. Currenty 1 week
const waitTarget = 4 * 60; // Target for wait times

function edSim(logFunction) 
{
// Create a new instance of simjs
    var sim = new Sim(); 
// Create a source of random numbers. For sophisticated modelling several independent sources can be created
    var random = new Random();
// Create a simjs statistics object for recording basic patient arrivals and departures
    var stats = new Sim.Population();
// Statistics object to track achievement of the wait time target
    var seenWithinTarget = new Sim.DataSeries();

// Utility function to calculate a delay so that a timer can be set for a target time
    function calcDelay (entity, target) {
    	var delay = target - entity.time();
    	return (delay < 0) ? 0 : delay;
    }

// Patter for an Entity to model the patients going through the ED       
    var Patient = {
        start: function () {
            // Get the next incident details
            this.details = cases.next().value;
            // Wait until the incident is due to start
            this.setTimer(calcDelay(this, this.details.incidentTime)).done(function () {
                sim.log('>Patient ' + this.details.caseReference + ' starting');
                sim.log('>Details:');
                sim.log(JSON.stringify(this.details, null, 2));
                // Kick off the next patient
                patient = sim.addEntity(Patient);
                this.travel();
            });
        },
        
        travel: function () {
            sim.log('>Patient ' + this.details.caseReference + ' travelling to ED ' + ((this.details.arriveByAmbulance)? "in an ambulance" : "in private or public transport"));
            // Set a timer to simulate journey to the ED
            // Could be extended to model Ambulance service at some point
            this.setTimer(calcDelay(this, this.details.travelDuration)).done(this.triage);
        },

        triage: function () {
            sim.log('>Patient ' + this.details.caseReference + ' queueing for triage');
            this.enterTime = this.time();
            stats.enter(this.enterTime); //These stats will show wait times

            //Got through appropriate triage route depending upon transport
            var nurseType = (this.details.arriveByAmbulance) ? "triageA" : "triage";
            // Wait in queue then see the triage nurse
            this.useFacility(serviceElements[nurseType], this.details.triageDuration).done(this.consultation());
        },

        consultation: function () {
            sim.log('>Patient ' + this.details.caseReference + ' queueing for a doctor');
            this.useFacility(serviceElements.doctors, this.details.consultationTime).done(function () {
                sim.log('>Patient ' + this.details.caseReference + ' leaving the ED');
                stats.leave(this.enterTime, this.time()); //These stats will show wait times
                seenWithinTarget.record((this.time() - this.enterTime < waitTarget) ? 1 : 0);
            });
        }
    };

// Object to hold objects for assets and staff
    var serviceElements = {};

// Have not yet built a model for raising and lowering staff on shifts so just use fixed ones for now
    for (var i =0; i < serviceConfig.staff.length; i++) {
        // Model staff types as Facilities. Will need to add a priority order feature for doctors
        serviceElements[serviceConfig.staff[i].label] = new Sim.Facility(serviceConfig.staff[i].name, Sim.Facility.FCFS, (i===0) ? 5 : 1);
    }

    for (i=0; i < serviceConfig.assets.length; i++) {
        // Model assets as Facilities. Will need to use alternatives when combining e.g. doctors and resus units
        serviceElements[serviceConfig.assets[i].label] = new Sim.Facility(serviceConfig.assets[i].name, Sim.Facility.FCFS, serviceConfig.assets[i].count);
    }

/*
// To be developed. Will read shift movement and adjust the staffing levels in the model. Will need to extend "sim.addFacility" to handle this
    var StaffDispatcher = {
    	start: function() {
    		var shift = staffing.next().value;
            this.setTimer(calcDelay(this, shift.time)).done(function() {
            // adjust the number of staff
            });
    	}
    };

    sim.addEntity(StaffDispathcher); */

    
//  Set route to display logging information
    sim.setLogger(logFunction);

    sim.log('Cases: ' + JSON.stringify(caseConfig.meta, null, 2));
    sim.log('Service: ' + JSON.stringify(serviceConfig.meta, null, 2));

    
// Add the first patient
    sim.addEntity(Patient);
    sim.log('Simulation starting');

    sim.simulate(Simtime);

    sim.log('Simulation complete');
    sim.log((seenWithinTarget.average() * 100).toPrecision(2) + '% seen within target time');
    sim.log('Wait times: Mean: ' + stats.durationSeries.average().toPrecision(2) + ' minutes. Deviation: ' + stats.durationSeries.deviation().toPrecision(2));
    sim.log('Patients in ED: Mean: ' + stats.sizeSeries.average().toPrecision(2) + '. Deviation: ' + stats.sizeSeries.deviation().toPrecision(2));

    
    return { waitPerformance: seenWithinTarget.average()};
    
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = edSim;
}