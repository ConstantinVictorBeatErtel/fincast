'use client';

import React, { useState } from 'react';
// Note: Imports for shadcn/ui components (e.g., Button, Input, Label, Popover, Calendar)
// and date-fns (for date formatting) are assumed to be handled at a higher level
// or within the file where this component will be placed.
// For example:
// import { Calendar } from '@/components/ui/calendar';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label';
// import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// import { CalendarIcon } from 'lucide-react'; // Assuming lucide-react is used for icons
// import { format } from 'date-fns'; // For date formatting

export default function RoomBookingPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');

  const availableTimes = [
    '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM',
    '05:00 PM'
  ];

  const handleBookingSubmit = (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime || !name || !email) {
      setBookingMessage('Please fill in all fields.');
      return;
    }
    // In a real application, you would send this data to a backend API
    console.log('Booking submitted:', {
      date: selectedDate.toDateString(),
      time: selectedTime,
      name,
      email,
    });
    setBookingMessage(`Booking for ${name} on ${selectedDate.toLocaleDateString()} at ${selectedTime} confirmed!`);
    // Optionally reset form fields after successful submission
    setName('');
    setEmail('');
    setSelectedTime('');
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl bg-white shadow-lg rounded-lg">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">Book a Room</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Calendar and Time Selection Section */}
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-gray-700">Select Date & Time</h2>
          <div className="mb-6">
            <Label htmlFor="date-picker" className="block text-sm font-medium text-gray-700 mb-2">
              Date
            </Label>
            {/* Using shadcn/ui Popover and Calendar components */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={`w-full justify-start text-left font-normal ${!selectedDate ? "text-muted-foreground" : ""}`}
                >
                  {/* Assuming CalendarIcon from lucide-react is available */}
                  {/* <CalendarIcon className="mr-2 h-4 w-4" /> */}
                  {selectedDate ? (
                    // Using toLocaleDateString as format from date-fns is not imported here
                    selectedDate.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="mb-6">
            <Label htmlFor="time-slot" className="block text-sm font-medium text-gray-700 mb-2">
              Available Times
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {availableTimes.map((time) => (
                <Button
                  key={time}
                  variant={selectedTime === time ? 'default' : 'outline'}
                  onClick={() => setSelectedTime(time)}
                  className="w-full"
                >
                  {time}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Booking Form Section */}
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-gray-700">Your Details</h2>
          <form onSubmit={handleBookingSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </Label>
              <Input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                required
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </Label>
              <Input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
                className="w-full"
              />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              Confirm Booking
            </Button>
            {bookingMessage && (
              <p className={`mt-4 text-center text-sm font-medium ${bookingMessage.includes('confirmed') ? 'text-green-600' : 'text-red-600'}`}>
                {bookingMessage}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
