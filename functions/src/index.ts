import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { DocumentData, getFirestore } from 'firebase-admin/firestore';

admin.initializeApp();
const db = getFirestore();

enum JobApplicationStatus {
  InProgress,
  OfferSent,
  OfferAccepted,
  OfferDeclined,
  ApplicationDeclined,
  Hired,
}

export const processDecentralHireEvents = functions.firestore
  .document('/moralis/events/Decentralhire/{eventId}')
  .onWrite((change) => {
    const message = change.after.data();

    if (message && !message.processed) {
      functions.logger.log('Retrieved event content: ', message);

      try {
        processEventsByType(message);
      } catch (error) {
        functions.logger.error('Failed to process event: ', error);
        return null;
      }

      return change.after.ref.update({
        ...message,
        processed: true,
      });
    }
    return null;
  });

const processEventsByType = (message: DocumentData) => {
  switch (message.name) {
    case 'JobPostingCreatedEvent':
      processJobPostingCreatedEvent(message);
      break;
    case 'JobPostingClosedEvent':
      processJobPostingClosedEvent(message);
      break;
    case 'JobApplicationCreatedEvent':
      processJobApplicationCreatedEvent(message);
      break;
    case 'JobApplicationOfferSentEvent':
      processJobApplicationOfferSentEvent(message);
      break;
    case 'JobApplicationOfferAcceptedEvent':
      processJobApplicationOfferAcceptedEvent(message);
      break;
    case 'JobApplicationOfferDeclinedEvent':
      processJobApplicationOfferDeclinedEvent(message);
      break;
    case 'JobApplicationApplicationDeclinedEvent':
      processJobApplicationApplicationDeclinedEvent(message);
      break;
    case 'JobApplicationHiredEvent':
      processJobApplicationHiredEvent(message);
      break;
    default:
      break;
  }
};

const processJobPostingCreatedEvent = async (message: DocumentData) => {
  const jobPosting = message;

  const companyProfileAddress = (
    jobPosting._companyProfileAddress || ''
  ).toString();
  const jobTitle = jobPosting._title;
  const country = jobPosting._country;
  const city = jobPosting._city;
  const isRemote = jobPosting._isRemote === 'true';
  const contractAddress = (jobPosting._contractAddress || '').toString();

  if (!companyProfileAddress || !contractAddress) {
    functions.logger.log(
      `Failed to process JobPostingCreatedEvent: missing 'companyProfileAddress' or 'contractAddress' (companyProfileAddress: ${companyProfileAddress}, contractAddress: ${contractAddress})`
    );
    return;
  }

  const existingJobPosting = await findJobPostingByContractAddress(
    contractAddress
  );

  const contractAddressLowerCase = contractAddress.toLowerCase();
  const companyAddressLowerCase = companyProfileAddress.toLowerCase();

  const data = {
    contractAddress,
    companyAddress: companyProfileAddress,
    jobTitle,
    country,
    city,
    isRemote,
    isActive: true,
    contractAddressLowerCase,
    companyAddressLowerCase,
  };

  if (existingJobPosting) {
    await db.collection('JobPostings').doc(existingJobPosting.id).update(data);
  } else {
    // write to the JobPostings document
    await db.collection('JobPostings').add(data);
  }
};

const processJobPostingClosedEvent = async (message: DocumentData) => {
  const jobPosting = message;

  const companyProfileAddress = (
    jobPosting._companyProfileAddress || ''
  ).toString();
  const contractAddress = (jobPosting._contractAddress || '').toString();

  if (!companyProfileAddress || !contractAddress) {
    functions.logger.error(
      `Failed to process JobPostingClosedEvent: missing 'companyProfileAddress' or 'contractAddress' (companyProfileAddress: ${companyProfileAddress}, contractAddress: ${contractAddress})`
    );
    throw new Error(`missing 'companyProfileAddress' or 'contractAddress'`);
  }

  const existingJobPosting = await findJobPostingByContractAddress(
    contractAddress
  );

  if (!existingJobPosting) {
    functions.logger.error(
      `Failed to process JobPostingClosedEvent: JobPosting not found (contractAddress: ${contractAddress})`
    );
    throw new Error(
      `JobPosting not found (contractAddress: ${contractAddress})`
    );
  }

  const contractAddressLowerCase = contractAddress.toLowerCase();
  const companyAddressLowerCase = companyProfileAddress.toLowerCase();

  // update the JobPostings document
  await db
    .collection('JobPostings')
    .doc(existingJobPosting.id)
    .update({
      ...existingJobPosting.data(),
      contractAddress,
      companyAddress: companyProfileAddress,
      isActive: false,
      contractAddressLowerCase,
      companyAddressLowerCase,
    });
};

const processJobApplicationCreatedEvent = async (message: DocumentData) => {
  const jobApplication = message;

  const applicantAddress = (jobApplication._applicant || '').toString();
  const contractAddress = (jobApplication._contractAddress || '').toString();
  const jobPostingAddress = (
    jobApplication._jobPostingAddress || ''
  ).toString();

  validateIfRequriedFieldsExistForJobApplication(
    jobApplication.name,
    applicantAddress,
    contractAddress,
    jobPostingAddress
  );

  const existingJobApplication = await findJobApplicationByContractAddress(
    contractAddress
  );

  const contractAddressLowerCase = contractAddress.toLowerCase();
  const applicantAddressLowerCase = applicantAddress.toLowerCase();
  const jobPostingAddressLowerCase = jobPostingAddress.toLowerCase();

  const data = {
    contractAddress,
    applicantAddress,
    jobPostingAddress,
    status: JobApplicationStatus.InProgress,
    contractAddressLowerCase,
    applicantAddressLowerCase,
    jobPostingAddressLowerCase,
  };

  if (existingJobApplication) {
    await db
      .collection('JobApplications')
      .doc(existingJobApplication.id)
      .update(data);
  } else {
    // write to the JobPostings document
    await db.collection('JobApplications').add(data);
  }
};

const jobApplicationStatusChangeEventBase = async (
  message: DocumentData,
  status: JobApplicationStatus
) => {
  const jobApplication = message;

  const applicantAddress = (jobApplication._applicant || '').toString();
  const contractAddress = (jobApplication._contractAddress || '').toString();
  const jobPostingAddress = (
    jobApplication._jobPostingAddress || ''
  ).toString();

  validateIfRequriedFieldsExistForJobApplication(
    jobApplication.name,
    applicantAddress,
    contractAddress,
    jobPostingAddress
  );

  const existingJobApplication = await findJobApplicationByContractAddress(
    contractAddress
  );

  if (!existingJobApplication) {
    functions.logger.error(
      `Failed to process ${jobApplication.name}: JobApplication not found (contractAddress: ${contractAddress})`
    );
    throw new Error(
      `JobApplication not found (contractAddress: ${contractAddress})`
    );
  }

  const contractAddressLowerCase = contractAddress.toLowerCase();
  const applicantAddressLowerCase = applicantAddress.toLowerCase();
  const jobPostingAddressLowerCase = jobPostingAddress.toLowerCase();

  // update the JobApplications document
  await db
    .collection('JobApplications')
    .doc(existingJobApplication.id)
    .update({
      ...existingJobApplication.data(),
      contractAddress,
      applicantAddress,
      jobPostingAddress,
      status,
      contractAddressLowerCase,
      applicantAddressLowerCase,
      jobPostingAddressLowerCase,
    });
};

const processJobApplicationOfferSentEvent = async (message: DocumentData) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.OfferSent
  );
};

const processJobApplicationOfferAcceptedEvent = async (
  message: DocumentData
) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.OfferAccepted
  );
};

const processJobApplicationOfferDeclinedEvent = async (
  message: DocumentData
) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.OfferDeclined
  );
};

const processJobApplicationApplicationDeclinedEvent = async (
  message: DocumentData
) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.ApplicationDeclined
  );
};

const processJobApplicationHiredEvent = async (message: DocumentData) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.Hired
  );
};

const findJobPostingByContractAddress = async (contractAddress: string) => {
  const matchedExistingJobPostings = (
    await db
      .collection('JobPostings')
      .where('contractAddress', '==', contractAddress)
      .get()
  ).docs;

  return matchedExistingJobPostings.length
    ? matchedExistingJobPostings[0]
    : undefined;
};

const findJobApplicationByContractAddress = async (contractAddress: string) => {
  const matchedExistingJobApplications = (
    await db
      .collection('JobApplications')
      .where('contractAddress', '==', contractAddress)
      .get()
  ).docs;

  return matchedExistingJobApplications.length
    ? matchedExistingJobApplications[0]
    : undefined;
};

const validateIfRequriedFieldsExistForJobApplication = (
  eventName: string,
  applicantAddress: string,
  contractAddress: string,
  jobPostingAddress: string
) => {
  if (!applicantAddress || !contractAddress || !jobPostingAddress) {
    functions.logger.error(
      `Failed to process ${eventName}: missing 'applicant' or 'contractAddress' or 'jobPostingAddress' ` +
        `(applicant: ${applicantAddress}, contractAddress: ${contractAddress}, jobPostingAddress: ${jobPostingAddress})`
    );
    throw new Error(
      `missing 'applicant' or 'contractAddress' or 'jobPostingAddress'`
    );
  }
};
