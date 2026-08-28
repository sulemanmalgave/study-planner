import React, { useState } from 'react';
import { motion } from 'motion/react';
import { pageVariants } from '../lib/animations';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckSquare, GraduationCap, CalendarDays } from 'lucide-react';
import { Course, TimetablePeriod, Assignment, Exam } from '../types';

interface CalendarViewProps {
  courses: Course[];
  timetable: TimetablePeriod[];
  assignments: Assignment[];
  exams: Exam[];
}

export default function CalendarView({ courses, timetable, assignments, exams }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // Day of week (0-6)
  
  // Normalize index so Monday is 0, Sunday is 6
  const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  const prevMonthDays = new Date(year, month, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const getDayDetails = (dayNum: number) => {
    const paddedDay = String(dayNum).padStart(2, '0');
    const paddedMonth = String(month + 1).padStart(2, '0');
    const dateStr = `${year}-${paddedMonth}-${paddedDay}`;

    // 1. Assignments due
    const dayAssignments = assignments.filter(a => a.dueDate === dateStr);
    // 2. Exams
    const dayExams = exams.filter(e => e.date.startsWith(dateStr));
    
    // 3. Classes scheduled for this day-of-week
    const d = new Date(year, month, dayNum);
    const daysStr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekName = daysStr[d.getDay()];
    const dayClasses = timetable.filter(t => t.day === dayOfWeekName);

    return {
      assignments: dayAssignments,
      exams: dayExams,
      classes: dayClasses,
      dateStr
    };
  };

  const calendarCells = [];

  // Previous Month's padding days
  for (let i = startOffset; i > 0; i--) {
    calendarCells.push({
      dayNum: prevMonthDays - i + 1,
      isCurrentMonth: false,
      dayDetails: null
    });
  }

  // Current Month's days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarCells.push({
      dayNum: i,
      isCurrentMonth: true,
      dayDetails: getDayDetails(i)
    });
  }

  // Next Month's padding days to complete grid (multiples of 7)
  const totalCells = Math.ceil(calendarCells.length / 7) * 7;
  const nextMonthPadding = totalCells - calendarCells.length;
  for (let i = 1; i <= nextMonthPadding; i++) {
    calendarCells.push({
      dayNum: i,
      isCurrentMonth: false,
      dayDetails: null
    });
  }

  const getCourseColor = (courseId: string) => {
    const course = courses.find(c => c.id === courseId);
    return course?.color || '#3b82f6';
  };

  return (
    <motion.div 
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6 text-[#1D1B20]" 
      id="calendar-view-root"
    >
      
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white border border-[#E1E3E1] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EADDFF] text-[#21005D] rounded-xl border border-[#D0BCFF]">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1D1B20] tracking-wide uppercase">Academic Calendar</h2>
            <p className="text-[10px] font-mono text-[#49454F] mt-1 uppercase">Track assignment releases, exam boards & classes</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handlePrevMonth}
            className="p-2 bg-[#F3EDF7] hover:bg-[#EADDFF] text-[#1D1B20] rounded-full transition-colors border border-[#E1E3E1] btn-press cursor-pointer"
            id="prev-month-button"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-black text-[#1D1B20] tracking-widest uppercase min-w-[120px] text-center">
            {monthNames[month]} {year}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-2 bg-[#F3EDF7] hover:bg-[#EADDFF] text-[#1D1B20] rounded-full transition-colors border border-[#E1E3E1] btn-press cursor-pointer"
            id="next-month-button"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="bg-white border border-[#E1E3E1] rounded-2xl overflow-hidden p-4 shadow-sm">
        
        {/* Days of Week Headers */}
        <div className="grid grid-cols-7 gap-2 text-center pb-3 border-b border-[#E1E3E1] mb-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <span key={day} className="text-[10px] font-black text-[#49454F] uppercase tracking-widest">{day}</span>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-2 min-h-[420px]" id="calendar-days-grid">
          {calendarCells.map((cell, index) => {
            const isToday = cell.isCurrentMonth && 
              new Date().getDate() === cell.dayNum && 
              new Date().getMonth() === month && 
              new Date().getFullYear() === year;

            return (
              <div
                key={index}
                className={`p-2 rounded-xl flex flex-col justify-between border min-h-[72px] transition-all relative ${
                  !cell.isCurrentMonth
                    ? 'bg-[#F7F9FC]/45 border-transparent text-slate-400'
                    : isToday
                    ? 'bg-[#EADDFF] border-[#6750A4] text-[#21005D]'
                    : 'bg-[#F7F9FC] border-[#E1E3E1] text-[#1D1B20] hover:border-[#6750A4]/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black ${isToday ? 'text-blue-400' : ''}`}>
                    {cell.dayNum}
                  </span>
                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                </div>

                {/* Markers list inside current month */}
                {cell.isCurrentMonth && cell.dayDetails && (
                  <div className="mt-2 space-y-1 overflow-hidden max-h-[50px] scrollbar-thin">
                    {/* Class indicators (small dots) */}
                    {cell.dayDetails.classes.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {cell.dayDetails.classes.map(cl => (
                          <div
                            key={cl.id}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: getCourseColor(cl.courseId) }}
                            title={`Class: ${cl.subject}`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Due Assignments indicators */}
                    {cell.dayDetails.assignments.map(as => (
                      <div
                        key={as.id}
                        className="px-1 py-0.5 text-[8px] font-black tracking-wide rounded border leading-none truncate"
                        style={{
                          backgroundColor: getCourseColor(as.courseId) + '15',
                          borderColor: getCourseColor(as.courseId) + '30',
                          color: getCourseColor(as.courseId),
                        }}
                        title={`Task: ${as.title}`}
                      >
                        ✓ {as.title}
                      </div>
                    ))}

                    {/* Exams indicators */}
                    {cell.dayDetails.exams.map(ex => (
                      <div
                        key={ex.id}
                        className="px-1 py-0.5 text-[8px] font-black tracking-wide rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 leading-none truncate"
                        title={`Exam: ${ex.name}`}
                      >
                        🏆 {ex.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
